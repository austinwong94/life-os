const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const R=require('../auth-renewal.js');
test('credential shape checks reject malformed storage while retaining legacy access-only sessions',()=>{
 assert.equal(R.hasIdentity({access_token:'synthetic-access',user:{id:'owner'}}),true);
 assert.equal(R.hasIdentity({access_token:'synthetic-access',refresh_token:'synthetic-refresh',user:{id:'owner'}}),true);
 for(const value of [null,[],{}, {access_token:{},user:{id:'owner'}},{access_token:1,user:{id:'owner'}},{access_token:'synthetic',user:{id:1}},{access_token:'synthetic',refresh_token:{},user:{id:'owner'}}])assert.equal(R.hasIdentity(value),false);
});
test('renewal receipt keys are SHA-256 digests rather than stored credentials',async()=>{
 const token='Synthetic-only-refresh-token';const key=await R.digest(token);
 assert.equal(key,crypto.createHash('sha256').update(token).digest('hex'));assert.match(key,/^[a-f0-9]{64}$/);assert(!key.includes(token));
});
test('missing and non-string tokens are rejected without being printed',async()=>{
 for(const token of ['',null,undefined,{},123])await assert.rejects(R.digest(token),/renewal token is required/);
});
test('receipt validation only accepts its exact token-free metadata format',()=>{
 for(const status of ['pending','applied'])assert.doesNotThrow(()=>R.validate({format:'life-os-auth-renewal-v1',status,attempt:'synthetic-attempt'}));
 assert.doesNotThrow(()=>R.validate(undefined));
 for(const row of [null,[],{},true,{format:'other',status:'applied',attempt:'x'},{format:'life-os-auth-renewal-v1',status:'unknown',attempt:'x'},{format:'life-os-auth-renewal-v1',status:'pending',attempt:''},{format:'life-os-auth-renewal-v1',status:'pending',attempt:'x',unexpected:'kept-original'}])assert.throws(()=>R.validate(row),{name:'AuthRenewalReceiptError'});
});
test('denied coordination storage fails without leaking the token or writing another store',async()=>{
 const token='Synthetic-Private-Token';let opens=0;
 const receipts=R.create({name:'synthetic-auth',database:{open(){opens++;throw new Error(token);}}});
 await assert.rejects(receipts.claim(token),error=>error.name==='AuthRenewalStorageError' && !error.message.includes(token));assert.equal(opens,1);
});
test('invalid completion receipts are refused before opening any database',async()=>{
 let opens=0;const receipts=R.create({name:'synthetic-auth',database:{open(){opens++;}}});
 await assert.rejects(receipts.complete({key:'raw-token',attempt:'x'}),{name:'AuthRenewalStorageError'});assert.equal(opens,0);
});
