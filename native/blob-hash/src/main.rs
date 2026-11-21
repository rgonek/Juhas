use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::env;
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Component, Path};
use std::process::ExitCode;

fn blob_hash<D: Digest>(path: &Path) -> io::Result<String> {
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
        || !fs::symlink_metadata(path)?.is_file()
    {
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

fn hashes(mut args: impl Iterator<Item = OsString>) -> io::Result<Vec<String>> {
    if args.next().as_deref().and_then(|arg| arg.to_str()) != Some("--hash") {
        return Err(io::Error::other("expected --hash <sha1|sha256> <paths...>"));
    }
    let algorithm = args.next().and_then(|arg| arg.into_string().ok());
    let compute = match algorithm.as_deref() {
        Some("sha1") => blob_hash::<Sha1>,
        Some("sha256") => blob_hash::<Sha256>,
        _ => return Err(io::Error::other("unsupported hash algorithm")),
    };
    args.map(|path| compute(Path::new(&path))).collect()
}

fn main() -> ExitCode {
    match hashes(env::args_os().skip(1)) {
        Ok(hashes) => {
            for hash in hashes {
                println!("{hash}");
            }
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(2)
        }
    }
}
