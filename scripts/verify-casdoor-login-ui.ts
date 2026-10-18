import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join,dirname,resolve} from 'node:path'
import {transformSync} from 'esbuild'
import * as React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {loadLoginMethod,loginNativeAdministrator} from '../modules/identity-access/client/authentication-api'
import {loadLoginSettings,LoginSettingsReadError} from '../modules/identity-access/client/login-settings-api'
const root=process.cwd(), nativeRequire=createRequire(import.meta.url)
type Component=React.ComponentType<any>
function loadUi(relative:string,gateStates?:unknown[]):Record<string,unknown>{
  const cache=new Map<string,{exports:Record<string,unknown>}>()
  function load(filename:string):Record<string,unknown>{
    if(cache.has(filename))return cache.get(filename)!.exports
    const fixtureModule={exports:{} as Record<string,unknown>};cache.set(filename,fixtureModule)
    const compiled=transformSync(readFileSync(filename,'utf8'),{loader:filename.endsWith('.tsx')?'tsx':'ts',format:'cjs',jsx:'automatic',target:'es2020'}).code
    let stateIndex=0
    const localRequire=(specifier:string):unknown=>{
      if(specifier==='react'&&filename.endsWith('/AuthGate.tsx')&&gateStates)return{...React,useState:()=>[gateStates[stateIndex++],()=>{}],useEffect:()=>{}}
      if(specifier.endsWith('.css'))return{}
      if(specifier.startsWith('@/')||specifier.startsWith('.')){
        const base=specifier.startsWith('@/')?join(root,specifier.slice(2)):resolve(dirname(filename),specifier)
        for(const suffix of ['','.tsx','.ts','/index.tsx','/index.ts'])if(existsSync(base+suffix)&&/\.(tsx?|jsx?)$/.test(base+suffix))return load(base+suffix)
      }
      return nativeRequire(specifier)
    }
    new Function('module','exports','require',compiled)(fixtureModule,fixtureModule.exports,localRequire)
    return fixtureModule.exports
  }
  return load(join(root,relative))
}
const method={mode:'casdoor',ready:true,settingsHref:'/settings/login',recoveryHref:'/admin-login'}
function gateHtml(current:unknown,message='',registration=false){
  const Gate=loadUi('app/components/AuthGate.tsx',[null,true,'login',message,registration,current,true]).default as Component
  const props = {children:()=>React.createElement('span',null,'private-business')}
  return renderToStaticMarkup(React.createElement(Gate,props))
}
let checks=0
async function main(){
  const casdoor=gateHtml(method)
  assert.match(casdoor,/class="oak-auth-screen"/);assert.match(casdoor,/使用 Casdoor 登录/);assert.match(casdoor,/管理员恢复登录/);assert.doesNotMatch(casdoor,/type="password"|微信|提交注册|private-business/);checks++
  for(const current of [null,{...method,mode:'invalid',ready:false},{...method,ready:false}]){const html=gateHtml(current);assert.match(html,/登录暂不可用/);assert.doesNotMatch(html,/type="password"|微信|使用 Casdoor 登录/);assert.match(html,/\/settings\/login/)}checks++
  const waiting=gateHtml(method,'CASDOOR_BINDING_REQUIRED');assert.match(waiting,/等待业务账号关联/);assert.match(waiting,/已有的有效 MES 账号/);assert.doesNotMatch(waiting,/type="password"/);checks++
  assert.match(gateHtml(method,'LOCAL_LOGOUT_COMPLETE'),/已退出本站，身份中心会话可能仍然有效/);checks++
  const LoginView=loadUi('modules/identity-access/ui/CasdoorLoginView.tsx').default as Component
  for(const returnPath of ['/?page=businessWorkbench','/?page=dashboard','/?page=orders']) {
    const html=renderToStaticMarkup(React.createElement(LoginView,{method,returnPath}))
    assert.ok(html.includes('/api/auth/casdoor/login?next='+encodeURIComponent(returnPath)))
  }
  assert.match(readFileSync(join(root,'app/components/AuthGate.tsx'),'utf8'), /window\.location\.pathname \+ window\.location\.search/);checks++
  const builtin=gateHtml({...method,mode:'builtin'},'',true);assert.match(builtin,/type="password"/);assert.match(builtin,/微信/);assert.match(builtin,/注册/);assert.match(builtin,/登录设置/);checks++
  const Native=loadUi('modules/identity-access/ui/NativeLoginForm.tsx').default as Component
  const recovery=renderToStaticMarkup(React.createElement(Native,{recovery:true,onSuccess:()=>{},onMessage:()=>{}}));assert.match(recovery,/管理员登录/);assert.match(recovery,/type="password"/);assert.doesNotMatch(recovery,/微信/);checks++
  const Settings=loadUi('modules/identity-access/ui/LoginSettingsPage.tsx').LoginSettingsContent as Component
  const publicSettings=renderToStaticMarkup(React.createElement(Settings,{method,status:null,message:'当前账号不能查看管理员连接参数。',onRefresh:()=>{}}));assert.match(publicSettings,/当前登录方式/);assert.match(publicSettings,/管理员恢复登录/);assert.doesNotMatch(publicSettings,/客户端 ID|精确回调地址/);checks++
  const diagnostics={...method,source:'runtime',issuer:'https://identity.fixture.invalid',clientId:'fixture-client',application:'mes-web',organization:'fixture-org',callbackUrl:'https://mes.fixture.invalid/api/auth/casdoor/callback',clientSecretConfigured:true,bindingPolicy:'explicit-existing-active-operator',localRecovery:'existing-active-admin-password',sessionLogout:'local-only',clientSecret:'must-never-render'}
  const adminSettings=renderToStaticMarkup(React.createElement(Settings,{method,status:diagnostics,onRefresh:()=>{}}));assert.match(adminSettings,/identity\.fixture\.invalid/);assert.match(adminSettings,/已配置，内容不显示/);assert.doesNotMatch(adminSettings,/must-never-render/);assert.match(adminSettings,/不代表已退出 Casdoor/);checks++
  const Menu=loadUi('app/components/shell/AccountMenu.tsx').default as Component
  for(const role of ['OPERATOR','ADMIN']){const html=renderToStaticMarkup(React.createElement(Menu,{containerRef:{current:null},operator:{name:'fixture',role},appVersion:'fixture',open:true,onToggle:()=>{},onLogout:()=>{}}));assert.match(html,/href="\/settings\/login"/)}checks++
  const previous=globalThis.fetch
  try{
    globalThis.fetch=async()=>Response.json({data:{...method,ready:false}},{status:503});assert.equal((await loadLoginMethod()).mode,'casdoor');assert.equal((await loadLoginMethod()).ready,false);checks++
    globalThis.fetch=async()=>Response.json({data:{...method,settingsHref:'https://external.invalid'}});await assert.rejects(loadLoginMethod());checks++
    globalThis.fetch=async()=>Response.json({error:'raw provider response must not show'},{status:403});await assert.rejects(loadLoginSettings(),error=>error instanceof LoginSettingsReadError&&error.status===403&&!error.message.includes('raw provider'));checks++
    globalThis.fetch=async()=>Response.json({data:diagnostics});const safe=await loadLoginSettings();assert.equal((safe as unknown as Record<string,unknown>).clientSecret,undefined);checks++
    globalThis.fetch=async(input,init)=>{assert.equal(input,'/api/auth/native-admin/login');assert.equal(init?.method,'POST');assert.deepEqual(JSON.parse(String(init?.body)),{username:'fixture-admin',password:'synthetic-only'});return Response.json({data:{id:'fixture'}})};await loginNativeAdministrator({username:'fixture-admin',password:'synthetic-only'});checks++
  }finally{globalThis.fetch=previous}
  console.log('Casdoor UI/client验证通过：'+checks+'组真实组件SSR/公共method/只读管理诊断/原密码恢复请求，未运行生产或创建会话。')
}
main().catch(error=>{console.error(error);process.exitCode=1})
