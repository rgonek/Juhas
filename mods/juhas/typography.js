// Semantic sizes are relative to the user's active Herdr font size. The window's
// rem basis is independent, so convert explicitly rather than assuming 1rem=font_size.
export function typography(fontSize,remSize){
 const base=fontSize,rem=remSize;
 const size=ratio=>`${base*ratio/rem}rem`,scale=base/14;
 return {fontSize:base,body:size(1),control:size(1),code:size(1),caption:size(0.875),heading:size(1.125),lineHeight:size(1.5),scale,px:value=>value*scale};
}
