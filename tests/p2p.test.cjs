const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const fs = require('node:fs');
const peers = new Map();
let seq = 0;
class Conn extends EventEmitter {
  constructor(peer, metadata) { super(); this.peer = peer; this.metadata = metadata; }
  send(msg) { queueMicrotask(() => this.other.emit('data', structuredClone(msg))); }
  close() { this.open = false; this.emit('close'); }
}
class Peer extends EventEmitter {
  constructor(id) {
    super(); this.id = typeof id === 'string' ? id : `guest-${++seq}`;
    queueMicrotask(() => {
      if (peers.has(this.id)) this.emit('error', Object.assign(new Error('Taken'), {type:'unavailable-id'}));
      else { peers.set(this.id, this); this.emit('open'); }
    });
  }
  connect(id, {metadata}) {
    const a = new Conn(id, metadata);
    queueMicrotask(() => {
      const host = peers.get(id);
      if (!host) return this.emit('error', Object.assign(new Error('Missing room'), {type:'peer-unavailable'}));
      const b = new Conn(this.id, metadata); a.other = b; b.other = a;
      host.emit('connection', b);
      a.open = b.open = true; a.emit('open'); b.emit('open');
    });
    return a;
  }
  destroy() { if (peers.get(this.id) === this) peers.delete(this.id); }
}
const context = vm.createContext({ Peer, console, setTimeout, clearTimeout, setInterval, clearInterval, location:{origin:'https://example.test',pathname:'/'} });
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../p2p.js'),'utf8')+'\nthis.Room = P2PRoom;',context);
const Room = context.Room;
Room.prototype._mountRoomBadge = () => {};
function room(opts={}) { return new Room({prefix:'test',requireMedia:false,...opts}); }
test('join waits for admission and transmits password',async()=>{
 const h=room(), g=room();
 try { await h.host('Host'); h.setRoomMeta({password:'secret'}); await g.join('Guest',h.roomCode,'secret'); assert.equal(g.roster.length,2); assert.equal(h.roster.length,2); }
 finally {g.destroy();h.destroy();}
});
test('wrong password rejects join without adding guest',async()=>{
 const h=room(),g=room();
 try {await h.host('Host');h.setRoomMeta({password:'secret'});await assert.rejects(g.join('Guest',h.roomCode,'wrong'),/Wrong password/);assert.equal(h.roster.length,1);}
 finally {g.destroy();h.destroy();}
});
test('full room rejects join',async()=>{
 const h=room({maxPeers:1}),g=room();
 try {await h.host('Host');await assert.rejects(g.join('Guest',h.roomCode),/full/);assert.equal(h.roster.length,1);}
 finally {g.destroy();h.destroy();}
});
test('missing room rejects join',async()=>{
 const g=room();try {await assert.rejects(g.join('Guest','absent'),/Missing room/);}finally{g.destroy();}
});
test('directory owner advertises its own game and member receives listing',async()=>{
 const h=room(), visitor=room({prefix:'hub'});let count=0,listing=[];
 try {
  await h.host('Host');h.onHubRoster=r=>count=r.length;await h.connectHub('Host');assert.equal(count,1);
  h.advertiseRoom();assert.equal(h._hub._directory.size,1);
  visitor.onDirectory=r=>listing=r;await visitor.connectHub('Visitor');await new Promise(r=>setImmediate(r));
  assert.equal(listing.length,1);assert.equal(listing[0].code,h.roomCode);
 } finally {visitor.destroy();h.destroy();}
});
test('leaving does not report host loss or schedule reconnection',async()=>{
 const h=room(),g=room();let lost=false;
 try {await h.host('Host');await g.join('Guest',h.roomCode);g.onHostGone=()=>lost=true;g.destroy();assert.equal(lost,false);g._scheduleHubReconnect('Guest');assert.equal(g._hubRetry,undefined);}
 finally {g.destroy();h.destroy();}
});
test('hub member can take over after directory owner leaves',async()=>{
 const owner=room({prefix:'hub'}),visitor=room({prefix:'hub'});
 try {await owner.connectHub('Owner');await visitor.connectHub('Visitor');assert.equal(visitor._hub.isHost,false);owner.destroy();await visitor.connectHub('Visitor');assert.equal(visitor._hub.isHost,true);}
 finally {owner.destroy();visitor.destroy();}
});
test('public beacons identify host and members without exposing password',async()=>{
 const h=room(),g=room();try{await h.host('Host');await g.join('Guest',h.roomCode);await h.connectHub('Host');h.advertiseRoom();const beacon=[...h._hub._directory.values()][0];assert.equal(beacon.hostName,'Host');assert.equal(beacon.members.length,2);assert.equal(beacon.members[1].name,'Guest');assert.equal(beacon.password,undefined);}finally{g.destroy();h.destroy();}
});
test('private rooms do not publish members to the hub',async()=>{
 const h=room();try{await h.host('Host');h.setRoomMeta({password:'private'});await h.connectHub('Host');h.advertiseRoom();assert.equal(h._hub._directory.size,0);}finally{h.destroy();}
});
