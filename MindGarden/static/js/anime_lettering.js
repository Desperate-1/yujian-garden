// Titles use a local subset of ZCOOL KuaiLe; the small print uses the reader's rounded Chinese face.
export const signLettering='"花园招牌", YouYuan, "PingFang SC", "Microsoft YaHei", sans-serif';
export const smallLettering='YouYuan, "PingFang SC", "Microsoft YaHei", sans-serif';

let loading;
export function loadStreetLettering(){
    if(typeof document==='undefined' || typeof FontFace==='undefined')return Promise.resolve();
    if(!loading){
        const url=new URL('../garden/quarter/street-lettering.woff',import.meta.url);
        const face=new FontFace('花园招牌','url("'+url.href+'") format("woff")');
        loading=face.load().then(font=>{document.fonts.add(font);}).catch(()=>{});
    }
    return loading;
}
