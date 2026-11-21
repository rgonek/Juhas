use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::env;
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Component, Path};
use std::process::{Command, ExitCode, Stdio};

fn blob_hash<D: Digest>(path: &Path) -> io::Result<String> {
    if !regular_path(path) || !fs::symlink_metadata(path)?.is_file() {
        return Err(io::Error::other("expected a regular repository file"));
    }

    let mut file = File::open(path)?;
    let length = file.metadata()?.len();

    let mut digest = D::new();
    digest.update(format!("blob {length}\0"));
    let mut buffer = [0; 64 * 1024];
    let mut remaining = length;
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        remaining = remaining
            .checked_sub(count as u64)
            .ok_or_else(|| io::Error::other("file length changed during hashing"))?;
        digest.update(&buffer[..count]);
    }
    if remaining != 0 {
        return Err(io::Error::other("file length changed during hashing"));
    }
    Ok(digest
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn regular_path(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && path
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
}

fn algorithm(arg: Option<OsString>) -> io::Result<fn(&Path) -> io::Result<String>> {
    match arg.as_deref().and_then(|arg| arg.to_str()) {
        Some("sha1") => Ok(blob_hash::<Sha1>),
        Some("sha256") => Ok(blob_hash::<Sha256>),
        _ => Err(io::Error::other("unsupported hash algorithm")),
    }
}

fn read_blob_range(
    reader: &mut impl BufRead,
    oid: &str,
    start: usize,
    count: usize,
    drain: bool,
) -> io::Result<Vec<u8>> {
    let mut header = String::new();
    reader.take(128).read_line(&mut header)?;
    let mut fields = header.split_ascii_whitespace();
    if fields.next() != Some(oid) || fields.next() != Some("blob") {
        return Err(io::Error::other("expected a Git blob"));
    }
    let size = fields
        .next()
        .and_then(|n| n.parse::<u64>().ok())
        .filter(|size| *size <= 32 * 1024 * 1024)
        .ok_or_else(|| io::Error::other("invalid or oversized blob"))?;
    let mut blob = reader.take(size);
    let mut line = Vec::new();
    let mut output = Vec::new();
    for index in 1..start + count {
        line.clear();
        blob.read_until(b'\n', &mut line)?;
        if line.last() != Some(&b'\n') {
            return Err(io::Error::other("range exceeds available complete lines"));
        }
        if index >= start {
            if output.len() + line.len() > 1024 * 1024 {
                return Err(io::Error::other("context output limit exceeded"));
            }
            output.extend_from_slice(&line);
        }
    }
    if drain {
        io::copy(&mut blob, &mut io::sink())?;
        if blob.limit() != 0 {
            return Err(io::Error::other("incomplete Git blob"));
        }
        let mut separator = [0];
        reader.read_exact(&mut separator)?;
        if separator[0] != b'\n' {
            return Err(io::Error::other("malformed Git batch response"));
        }
    }
    Ok(output)
}

fn compare_blob_ranges(
    old: &str,
    old_start: usize,
    new: &str,
    new_start: usize,
    count: usize,
) -> io::Result<Vec<u8>> {
    if [old, new]
        .iter()
        .any(|oid| !matches!(oid.len(), 40 | 64) || !oid.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err(io::Error::other("invalid blob ID"));
    }
    let same = old == new && old_start == new_start;
    let mut git = Command::new("git");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        git.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = git
        .env("GIT_NO_LAZY_FETCH", "1")
        .args(["cat-file", "--batch"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()?;
    let result = (|| {
        let mut input = child
            .stdin
            .take()
            .ok_or_else(|| io::Error::other("missing Git input"))?;
        writeln!(input, "{old}")?;
        if !same {
            writeln!(input, "{new}")?;
        }
        drop(input);
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("missing Git output"))?;
        let mut reader = BufReader::new(stdout);
        let previous = read_blob_range(&mut reader, old, old_start, count, !same)?;
        if !same && read_blob_range(&mut reader, new, new_start, count, false)? != previous {
            return Err(io::Error::other("blob context differs"));
        }
        Ok(previous)
    })();
    let _ = child.kill();
    child.wait()?;
    result
}

fn context(mut args: impl Iterator<Item = OsString>) -> io::Result<Vec<u8>> {
    let mut pair = || -> io::Result<(String, usize)> {
        let oid = args
            .next()
            .and_then(|arg| arg.into_string().ok())
            .ok_or_else(|| io::Error::other("missing blob ID"))?;
        let start = args
            .next()
            .and_then(|arg| arg.to_str()?.parse::<usize>().ok())
            .filter(|n| (1..=2_000_000).contains(n))
            .ok_or_else(|| io::Error::other("invalid start line"))?;
        Ok((oid, start))
    };
    let (old, old_start) = pair()?;
    let (new, new_start) = pair()?;
    let count = args
        .next()
        .and_then(|arg| arg.to_str()?.parse::<usize>().ok())
        .filter(|n| (1..=20_000).contains(n))
        .ok_or_else(|| io::Error::other("invalid context length"))?;
    let result = compare_blob_ranges(&old, old_start, &new, new_start, count)?;
    if result.contains(&0) || std::str::from_utf8(&result).is_err() {
        return Err(io::Error::other("context is not UTF-8 text"));
    }
    Ok(result)
}

fn output(mut args: impl Iterator<Item = OsString>) -> io::Result<Vec<u8>> {
    match args.next().as_deref().and_then(|arg| arg.to_str()) {
        Some("--hash") => {
            let compute = algorithm(args.next())?;
            let mut out = Vec::new();
            for path in args {
                writeln!(out, "{}", compute(Path::new(&path))?)?;
            }
            Ok(out)
        }
        Some("--context") => context(args),
        _ => Err(io::Error::other("unknown helper operation")),
    }
}

fn main() -> ExitCode {
    match output(env::args_os().skip(1)).and_then(|bytes| io::stdout().lock().write_all(&bytes)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(2)
        }
    }
}
