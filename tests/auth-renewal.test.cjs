const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const R=require('../auth-renewal.js');
test('Properties distinguishes saved-session storage and network failures from a real sign-in requirement',()=>{
 for(const error of [{name:'AuthRenewalStorageError'},{message:'Sign-in could not be saved on this browser.'}]){const result=R.describeFailure(error,{signedIn:true});assert.equal(result.kind,'storage');assert.equal(result.retry,false);assert.doesNotMatch(result.message,/Sign in to Life OS in Settings/);}
 assert.equal(R.describeFailure({name:'AuthRenewalReceiptError'},{signedIn:true}).kind,'recovery');
 assert.deepEqual(R.describeFailure({retryable:true,message:'Private URL https://secret.invalid/?token=private'},{signedIn:true}).kind,'connection');
 assert.doesNotMatch(R.describeFailure({retryable:true,message:'Private URL https://secret.invalid/?token=private'},{signedIn:true}).message,/secret|private/);
 assert.equal(R.describeFailure({message:'Cloud session expired or was revoked.'},{signedIn:true}).kind,'signin');
 assert.equal(R.describeFailure(new Error('Unavailable'),{signedIn:false}).kind,'signin');
 assert.equal(R.describeFailure(new Error('The cloud account changed or signed out.'),{signedIn:true}).kind,'account');
 assert.equal(R.describeFailure(new Error('Unexpected internal failure'),{signedIn:true}).kind,'connection');
});
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
