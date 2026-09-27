import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
const root='marketing/top3-combined-2026-09-27';
const ff=process.env.FFMPEG_PATH||execFileSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8',windowsHide:true}).trim();
const files=[];
for(const mode of ['combined','men','women'])for(const suffix of ['','-music']){
 const file=`${mode}-top3-outfits${suffix}.mp4`;
 const result=spawnSync(ff,['-hide_banner','-i',root+'/'+file,'-af','volumedetect','-f','null','-'],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw Error(file+result.stderr);
 const info=result.stderr.split('\n').filter(l=>/Duration:|Stream #0:|mean_volume:|max_volume:/.test(l));
 if(!info.some(l=>l.includes('1080x1920')))throw Error('Unexpected resolution: '+file);
 if(!info.some(l=>l.includes('30 fps')))throw Error('Unexpected frame rate: '+file);
 files.push({file,bytes:statSync(root+'/'+file).size,decodeExit:result.status,info});
 console.log(file,info.join('\n'));
}
const duration=JSON.parse(readFileSync(root+'/combined-timeline.json')).duration;
if(duration<60||duration>90)throw Error('Duration outside brief');
writeFileSync(root+'/verification.json',JSON.stringify({checkedAt:new Date().toISOString(),files},null,2)+'\n');
