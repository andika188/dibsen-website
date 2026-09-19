/* Three floating product monoliths: a product universe without a heavy 3D asset download. */
(function () {
  'use strict';
  var canvas=document.getElementById('product-orbit-canvas');
  if(!canvas)return;
  var container=canvas.closest('.product-orbit')||canvas.parentElement;
  if(!window.THREE)return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){
    /* Pengguna memilih tanpa animasi: biarkan showcase kartu HTML statis
       yang tampil rapi dan nyaman tanpa animasi orbit berputar. */
    return;
  }
  var low=innerWidth<720||(navigator.deviceMemory&&navigator.deviceMemory<=4), renderer;
  try{renderer=new THREE.WebGLRenderer({canvas:canvas,alpha:true,antialias:!low,powerPreference:'high-performance'});}catch(e){return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,low?1.2:1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;
  var scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.set(0,.15,11);
  scene.add(new THREE.AmbientLight(0xa98bca,1.45));var key=new THREE.PointLight(0xf2609b,15,18);key.position.set(-4,4,5);scene.add(key);var fill=new THREE.PointLight(0x85bd5b,11,15);fill.position.set(4,-2,5);scene.add(fill);
  var root=new THREE.Group(),cards=[],trims=[];scene.add(root);
  var specs=[
    {color:0xe6a877,emissive:0x944b11,pos:[-2.35,.3,0],rot:[-.1,.38,.05],shot:'/assets/shots/sm-ai.webp'},
    {color:0x85bd5b,emissive:0x36591c,pos:[0,-.25,.55],rot:[.06,-.05,0],shot:'/assets/shots/sx-dash.webp'},
    {color:0xfc9700,emissive:0x6d4100,pos:[2.35,.35,-.2],rot:[-.06,-.36,-.05],shot:'/assets/shots/sf-home.webp'}
  ];
  var loader=new THREE.TextureLoader();
  specs.forEach(function(spec,index){
    var group=new THREE.Group(), base=new THREE.Mesh(new THREE.BoxGeometry(2.05,3.45,.22),new THREE.MeshStandardMaterial({color:0x160d20,metalness:.72,roughness:.2}));group.add(base);
    var trim=new THREE.Mesh(new THREE.BoxGeometry(2.18,3.58,.12),new THREE.MeshStandardMaterial({color:spec.color,emissive:spec.emissive,emissiveIntensity:.38,metalness:.72,roughness:.25}));trim.position.z=-.08;group.add(trim);
    var screen=new THREE.Mesh(new THREE.PlaneGeometry(1.72,3.05),new THREE.MeshBasicMaterial({color:spec.color}));screen.position.z=.125;group.add(screen);
    loader.load(spec.shot,function(texture){texture.colorSpace=THREE.SRGBColorSpace;screen.material.map=texture;screen.material.color.setHex(0xffffff);screen.material.needsUpdate=true;});
    group.position.set(spec.pos[0],spec.pos[1],spec.pos[2]);group.rotation.set(spec.rot[0],spec.rot[1],spec.rot[2]);root.add(group);cards.push(group);trims.push(trim);
  });
  var ring=new THREE.Line(new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0,0,4,1.62,0,Math.PI*2).getPoints(100).map(function(p){return new THREE.Vector3(p.x,p.y,0);})),new THREE.LineBasicMaterial({color:0xf2609b,transparent:true,opacity:.4}));ring.rotation.x=.68;root.add(ring);
  function resize(){var w=canvas.clientWidth||(container?container.clientWidth:0),h=canvas.clientHeight||(container?container.clientHeight:0);if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.position.z=w<620?13.4:11;camera.updateProjectionMatrix();}addEventListener('resize',resize,{passive:true});resize();setTimeout(resize,100);
  var mouse={x:0,y:0},target={x:0,y:0},clock=new THREE.Clock(),active=true,firstFrame=true;addEventListener('pointermove',function(e){target.x=(e.clientX/innerWidth-.5)*2;target.y=(e.clientY/innerHeight-.5)*2;},{passive:true});document.addEventListener('visibilitychange',function(){active=!document.hidden;if(active)draw();});

  /* ---- kartu 3D jadi bisa diklik (2026-09-05) --------------------------
     Tujuan: pengunjung yang melihat produknya di sini tidak perlu
     menggulir seluruh halaman untuk menemukan penjelasannya. Label di
     bawah kanvas sudah jadi <a> sungguhan di HTML (itu jalur yang bekerja
     bahkan kalau WebGL mati, keyboard-accessible, dan terbaca crawler);
     bagian ini menambahkan jalur kedua lewat gambar kartunya.

     Raycast dijalankan di dalam loop gambar yang memang sudah berputar,
     bukan di tiap event pointermove — jadi tidak ada kerja tambahan per
     event, dan matriks yang dipakai sudah yang terbaru.

     Untuk KLIK, raycast diulang memakai koordinat event itu sendiri,
     bukan mengandalkan state hover: di layar sentuh tidak ada hover sama
     sekali, jadi ketukan pertama harus tetap mendarat dengan benar. */
  var HREFS=['#sosialmedia','#sipnex','#safe'];
  var labels=document.querySelectorAll('.product-orbit__labels a');
  var ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),ptr=null,hot=-1,pinned=-1;

  function pick(clientX,clientY){
    var r=canvas.getBoundingClientRect();
    if(!r.width||!r.height)return -1;
    ndc.x=((clientX-r.left)/r.width)*2-1;
    ndc.y=-((clientY-r.top)/r.height)*2+1;
    ray.setFromCamera(ndc,camera);
    var hits=ray.intersectObjects(cards,true);
    if(!hits.length)return -1;
    var o=hits[0].object;
    while(o&&cards.indexOf(o)<0)o=o.parent;
    return cards.indexOf(o);
  }
  function light(i){
    if(i===hot)return;
    hot=i;
    canvas.style.cursor=i<0?'':'pointer';
    for(var k=0;k<labels.length;k++)labels[k].classList.toggle('is-near',k===i);
  }
  canvas.addEventListener('pointermove',function(e){ptr={x:e.clientX,y:e.clientY};},{passive:true});
  canvas.addEventListener('pointerleave',function(){ptr=null;light(-1);},{passive:true});
  canvas.addEventListener('click',function(e){
    var i=pick(e.clientX,e.clientY);
    if(i<0)return;
    location.hash=HREFS[i];
  });
  /* hover di label menyalakan kartu 3D pasangannya — arah sebaliknya,
     supaya jelas label mana milik kartu mana sebelum diklik */
  for(var n=0;n<labels.length;n++)(function(idx){
    labels[idx].addEventListener('pointerenter',function(){pinned=idx;},{passive:true});
    labels[idx].addEventListener('pointerleave',function(){if(pinned===idx)pinned=-1;},{passive:true});
    labels[idx].addEventListener('focus',function(){pinned=idx;});
    labels[idx].addEventListener('blur',function(){if(pinned===idx)pinned=-1;});
  })(n);

  function draw(){if(!active)return;var t=clock.getElapsedTime();mouse.x+=(target.x-mouse.x)*.035;mouse.y+=(target.y-mouse.y)*.035;root.rotation.y=mouse.x*.16+Math.sin(t*.17)*.07;root.rotation.x=-mouse.y*.06;
    var lit=hot>=0?hot:pinned;
    cards.forEach(function(card,i){card.position.y=specs[i].pos[1]+Math.sin(t*.8+i*1.7)*.14;card.rotation.y=specs[i].rot[1]+Math.sin(t*.45+i)*.08;
      var s=i===lit?1.055:1;card.scale.x+=(s-card.scale.x)*.14;card.scale.y=card.scale.z=card.scale.x;
      var g=i===lit?1.15:.38,m=trims[i].material;m.emissiveIntensity+=(g-m.emissiveIntensity)*.14;});
    ring.rotation.z=t*.05;renderer.render(scene,camera);
    if(firstFrame){firstFrame=false;if(container)container.classList.add('is-webgl-active');resize();}
    if(ptr)light(pick(ptr.x,ptr.y));
    requestAnimationFrame(draw);}
  draw();
})();
