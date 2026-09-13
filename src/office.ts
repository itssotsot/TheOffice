import * as THREE from 'three';

/** Keep carpet fibers and veneer clear when viewed at a shallow walking angle. */
export function prepareOfficeMaterials(root:THREE.Object3D, renderer:THREE.WebGLRenderer) {
  const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const material of materials){
      if(!(material instanceof THREE.MeshStandardMaterial))continue;
      for(const texture of [material.map,material.normalMap,material.roughnessMap,material.metalnessMap]){
        if(texture)texture.anisotropy=anisotropy;
      }
    }
  });
}

/** Lighting for the editable Blender room loaded with the workstation assets. */
export function makeOffice(scene: THREE.Scene, workstation:THREE.Object3D=scene) {
  const sun = new THREE.DirectionalLight('#fffaf1', 1.9);
  sun.position.set(-35, 85, -48);
  sun.target.position.set(0, -1, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, {left: -125, right: 125, top: 100, bottom: -100, far: 280});
  sun.shadow.normalBias = .035;
  sun.shadow.bias = -.0004;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#f1f3f6', '#9d998f', 1.05));
  const fill = new THREE.DirectionalLight('#ffffff', .45);
  fill.position.set(3, 7, 8);
  scene.add(fill);

  // Soft venetian-blind light across the desktop supplements the room's actual slats.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(512, 256);
  ctx.rotate(-.23);
  for (let i = -10; i < 11; i++) {
    const grad = ctx.createLinearGradient(0, i * 67, 0, i * 67 + 27);
    grad.addColorStop(0, 'rgba(77,70,51,0)');
    grad.addColorStop(.2, 'rgba(77,70,51,.09)');
    grad.addColorStop(.8, 'rgba(77,70,51,.09)');
    grad.addColorStop(1, 'rgba(77,70,51,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-800, i * 67, 1600, 27);
  }
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(14.1, 7.30), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
  }));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = .006;
  workstation.add(shade);
}
