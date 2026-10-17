import assert from 'node:assert/strict'
import { logoutOperator, ProviderLogoutError } from '../modules/identity-access/client/authentication-api'
import {
  CASDOOR_HANDOFF_COOKIES, CASDOOR_HINT_COOKIES, CASDOOR_LOGOUT_STATE_COOKIE, casdoorLogoutForm,
  createCasdoorLogoutHandoff, readCasdoorLogoutHandoff, readCasdoorLogoutHint, readLogoutCookie,
  sealCasdoorLogoutHint, splitLogoutCookie, validateCasdoorLogoutCallback,
} from '../modules/identity-access/server/casdoor-logout-service'

const original = globalThis.fetch
const issuer = 'https://identity.synthetic.test'
let checks = 0
async function run() {
  try {
    let localRevoked = false
    let calls: string[] = []
    globalThis.fetch = async (input, init) => {
      const url = String(input); calls.push(url)
      if (url === '/api/auth/logout') return Response.json({success:true, providerLogoutIssuer:issuer})
      assert.equal(localRevoked, true)
      assert.equal(init?.credentials, 'include')
      assert.equal(init?.redirect, 'error')
      if (url.endsWith('/api/logout')) {
        assert.equal(init?.method, 'POST')
        return Response.json({status:'ok', data2:'https://untrusted.synthetic.test'})
      }
      const after = calls.some(x => x.endsWith('/api/logout'))
      return Response.json(after ? {status:'error', msg:'Please login first'} : {status:'ok',data:{owner:'fixture',name:'fixture'}})
    }
    assert.equal((await logoutOperator(() => {localRevoked=true})).providerConfirmed,true)
    assert.deepEqual(calls, ['/api/auth/logout', issuer+'/api/get-account', issuer+'/api/logout', issuer+'/api/get-account'])
    checks++
    for (const failure of ['cors', 'anonymous-before', 'provider-error', 'still-authenticated']) {
      localRevoked=false
      globalThis.fetch=async(input)=>{
        const url=String(input)
        if(url==='/api/auth/logout')return Response.json({success:true,providerLogoutIssuer:issuer})
        assert.equal(localRevoked,true)
        if(failure==='cors')throw new TypeError('synthetic blocked browser request')
        if(url.endsWith('/api/logout'))return Response.json({status:failure==='provider-error'?'error':'ok'})
        return Response.json(failure==='anonymous-before'?{status:'error',msg:'Please login first'}:{status:'ok',data:{owner:'fixture',name:'fixture'}})
      }
      await assert.rejects(logoutOperator(()=>{localRevoked=true}), error=>error instanceof ProviderLogoutError)
      assert.equal(localRevoked,true)
      checks++
    }
    calls=[];localRevoked=false
    globalThis.fetch=async(input)=>{calls.push(String(input));return Response.json({success:true,providerLogoutIssuer:null})}
    assert.equal((await logoutOperator(()=>{localRevoked=true})).providerConfirmed,false)
    assert.equal(localRevoked,true);assert.deepEqual(calls,['/api/auth/logout']);checks++
    calls=[];localRevoked=false
    globalThis.fetch=async(input)=>{calls.push(String(input));return Response.json({success:true,handoffUrl:'/api/auth/casdoor/logout',providerLogoutIssuer:null})}
    assert.equal((await logoutOperator(()=>{localRevoked=true})).handoffUrl,'/api/auth/casdoor/logout')
    assert.equal(localRevoked,true);assert.deepEqual(calls,['/api/auth/logout']);checks++
    for (const bad of ['https://external.synthetic.test', '/api/auth/casdoor/logout?next=foreign', '/api/auth/casdoor/login']) {
      globalThis.fetch=async()=>Response.json({success:true,handoffUrl:bad})
      await assert.rejects(logoutOperator(),ProviderLogoutError);checks++
    }
    for(const bad of ['https://identity.synthetic.test/foreign', 'http://identity.synthetic.test', 'https://identity.synthetic.test/?token=private']) {
      calls=[];localRevoked=false
      globalThis.fetch=async(input)=>{calls.push(String(input));return Response.json({success:true,providerLogoutIssuer:bad})}
      await assert.rejects(logoutOperator(()=>{localRevoked=true}),ProviderLogoutError)
      assert.equal(localRevoked,true);assert.deepEqual(calls,['/api/auth/logout']);checks++
    }
    localRevoked=false
    globalThis.fetch=async()=>Response.json({error:'synthetic failure'},{status:500})
    await assert.rejects(logoutOperator(()=>{localRevoked=true}));assert.equal(localRevoked,false);checks++
    const config={origin:'https://mes.synthetic.test',issuer,clientId:'fixture-client',clientSecret:'synthetic-only-strong-client-secret',generation:'fixture-generation'}
    const now=Date.now(),expires=new Date(now+7*86400_000),idToken='fixture.'+Buffer.from(JSON.stringify({exp:Math.floor(now/1000)+3600})).toString('base64url')+'.signature',session='synthetic-native-session'
    const jar=(names:readonly string[],values:string[],extra:Record<string,string>={})=>{const map={...Object.fromEntries(values.map((v,i)=>[names[i],v])),...extra};return{get:(name:string)=>map[name]?{value:map[name]}:undefined}}
    const parts=sealCasdoorLogoutHint(config,idToken,session,expires,now),cookies=jar(CASDOOR_HINT_COOKIES,parts)
    assert.ok(parts.length<=3&&parts.every(value=>value.length<=3000));assert.ok(parts.every(value=>!value.includes(idToken)));checks++
    const hint=readCasdoorLogoutHint(config,cookies,session,expires,now)!;assert.equal(hint.idToken,idToken);checks++
    assert.equal(readCasdoorLogoutHint(config,cookies,session,expires,now+3600_001)?.idToken,idToken);checks++
    assert.equal(readCasdoorLogoutHint(config,cookies,session,expires,expires.getTime()),null);checks++
    for(const changed of [{...config,generation:'other-generation'},{...config,clientSecret:'other-secret'},{...config,clientId:'other-client'},{...config,issuer:'https://other.synthetic.test'},{...config,origin:'https://other-mes.synthetic.test'}]){assert.equal(readCasdoorLogoutHint(changed,cookies,session,expires,now),null);checks++}
    assert.equal(readCasdoorLogoutHint(config,cookies,'other-session',expires,now),null);checks++
    assert.equal(readCasdoorLogoutHint(config,cookies,session,new Date(expires.getTime()+1),now),null);checks++
    const tampered=[parts[0].slice(0,-2)+(parts[0].endsWith('AA')?'BB':'AA'),...parts.slice(1)]
    assert.equal(readCasdoorLogoutHint(config,jar(CASDOOR_HINT_COOKIES,tampered),session,expires,now),null);checks++
    assert.throws(()=>sealCasdoorLogoutHint(config,'a.'+'b'.repeat(6000)+'.c',session,expires,now));checks++
    const large='a.'+'b'.repeat(5600)+'.c',largeParts=sealCasdoorLogoutHint(config,large,session,expires,now)
    assert.equal(largeParts.length,3);assert.ok(largeParts.every(value=>value.length<=3000));assert.equal(readCasdoorLogoutHint(config,jar(CASDOOR_HINT_COOKIES,largeParts),session,expires,now)?.idToken,large);checks++
    for(const values of [largeParts.slice(0,2),[...largeParts.slice(0,2),'2.invalid'],['4.invalid']]){assert.throws(()=>readLogoutCookie(jar(CASDOOR_HINT_COOKIES,values),CASDOOR_HINT_COOKIES));checks++}
    assert.throws(()=>splitLogoutCookie('a'.repeat(8995)));checks++
    const handoff=createCasdoorLogoutHandoff(config,hint,now),handoffJar=jar(CASDOOR_HANDOFF_COOKIES,handoff.parts,{[CASDOOR_LOGOUT_STATE_COOKIE]:handoff.stateCookie})
    const opened=readCasdoorLogoutHandoff(config,handoffJar,now);assert.equal(opened.idToken,idToken);checks++
    const query=new URLSearchParams({state:opened.state});assert.equal(validateCasdoorLogoutCallback(config,handoff.stateCookie,query,now),true);checks++
    assert.equal(validateCasdoorLogoutCallback(config,handoff.stateCookie,query,now+120_000),false);checks++
    for(const params of [new URLSearchParams({state:'wrong'}),new URLSearchParams({state:opened.state,next:'https://foreign.synthetic.test'}),new URLSearchParams('state='+opened.state+'&state='+opened.state)]){assert.equal(validateCasdoorLogoutCallback(config,handoff.stateCookie,params,now),false);checks++}
    assert.throws(()=>readCasdoorLogoutHandoff({...config,generation:'other'},handoffJar,now));checks++
    assert.throws(()=>readCasdoorLogoutHandoff(config,handoffJar,now+120_000));checks++
    const form=casdoorLogoutForm(config,opened)
    assert.match(form.html,/method="post"/);assert.match(form.html,/action="https:\/\/identity.synthetic.test\/api\/logout"/)
    assert.ok(form.html.includes('name="id_token_hint"'));assert.ok(form.html.includes('https://mes.synthetic.test/api/auth/casdoor/logout/callback'))
    assert.match(form.csp,/default-src 'none'/);assert.match(form.csp,/form-action 'self' https:\/\/identity.synthetic.test/);assert.doesNotMatch(form.html,/<script src=|\/api\/auth\/casdoor\/login/);checks++
    console.log(JSON.stringify({status:'passed',checks,node:process.version,scope:'actual shared helper/client plus AES-GCM cookie/handoff/state with synthetic transport; no production calls'}))
  } finally {globalThis.fetch=original}
}
run().catch(error=>{console.error(error);process.exitCode=1})
