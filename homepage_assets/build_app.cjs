// Builds only the dashboard; preserves the existing marketing and Worker assets.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
function composeApp(){
 const inputs={},read=file=>{const data=fs.readFileSync(path.join(ROOT,file));inputs[file]=crypto.createHash('sha256').update(data).digest('hex');return data.toString('utf8');};
 let html=read('homepage_assets/app_template.html');const nav=read('homepage_assets/_shared_nav.html').replace(/<a\b[^>]*href="app\.html"[^>]*>/,tag=>{let t=/\bclass="/.test(tag)?tag.replace(/\bclass="([^"]*)"/,(_m,c)=>'class="'+c+' current"'):tag.replace(/^<a\b/,'<a class="current"');return t.replace(/>$/,' aria-current="page">');});
 for(const [marker,content] of Object.entries({__SHARED_STYLES__:read('homepage_assets/_shared_styles.html'),__SHARED_NAV__:nav,__SHARED_FOOTER__:read('homepage_assets/_shared_footer.html')})){
  if(html.split(marker).length!==2)throw new Error('Expected one dashboard '+marker);html=html.replace(marker,()=>content);
 }
 for(const [name,file] of Object.entries({SESSION_POLICY:'shared/session_policy.js',SAVED_REPORTS_STYLE:'shared/saved_reports.css',SAVED_REPORTS:'shared/saved_reports.js'})){
  const marker='<!--'+name+'-->';if(html.split(marker).length!==2)throw new Error('Expected one dashboard '+marker);html=html.replace(marker,()=>name.endsWith('_STYLE')?'<style>\n'+read(file)+'\n</style>':'<script>\n'+read(file)+'\n</script>');
 }
 read('shared/compose_theme.cjs');
  html=html.replace('</head>',()=>require('../shared/compose_theme.cjs').composeTheme(read)+'</head>');
 read('homepage_assets/build_app.cjs');
 return {html,inputs,sha256:crypto.createHash('sha256').update(html).digest('hex')};
}
function writeApp(){const result=composeApp();fs.writeFileSync(path.join(ROOT,'dist/app.html'),result.html);return result;}
if(require.main===module){if(process.argv.includes('--check')){const r=composeApp();if(fs.readFileSync(path.join(ROOT,'dist/app.html'),'utf8')!==r.html)throw new Error('Dashboard source/dist mismatch');console.log('Verified dashboard');}else{writeApp();console.log('Built dashboard');}}
module.exports={composeApp,writeApp};
