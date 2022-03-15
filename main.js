import * as THREE from 'https://cdn.skypack.dev/pin/three@v0.137.0-X5O2PK3x44y1WRry67Kr/mode=imports/optimized/three.js';
import { EffectComposer } from 'https://unpkg.com/three@0.137.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.137.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://unpkg.com/three@0.137.0/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'https://unpkg.com/three@0.137.0/examples/jsm/postprocessing/SMAAPass.js';
import { GammaCorrectionShader } from 'https://unpkg.com/three@0.137.0/examples/jsm/shaders/GammaCorrectionShader.js';
import { EffectShader } from "./EffectShader.js";
import { OrbitControls } from 'https://unpkg.com/three@0.137.0/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.137.0/examples/jsm/controls/PointerLockControls.js';
import { AssetManager } from './AssetManager.js';
import { Stats } from "./stats.js";

function rayBoxDist(boundsMin, boundsMax, ray) {
    boundsMax = boundsMax.clone();
    boundsMin = boundsMin.clone();
    let t0 = (boundsMin.sub(ray.origin)).divide(ray.direction);
    let t1 = (boundsMax.sub(ray.origin)).divide(ray.direction);
    let tmin = t0.clone().min(t1);
    let tmax = t0.clone().max(t1);

    let distA = Math.max(Math.max(tmin.x, tmin.y), tmin.z);
    let distB = Math.min(tmax.x, Math.min(tmax.y, tmax.z));

    let distToBox = Math.max(0.0, distA);
    let distInsideBox = Math.max(0.0, distB - distToBox);
    return new THREE.Vector2(distToBox, distInsideBox);
}
async function main() {
    // Setup basic renderer, controls, and profiler
    const clientWidth = window.innerWidth * 0.99;
    const clientHeight = window.innerHeight * 0.98;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, clientWidth / clientHeight, 0.1, 1000);
    camera.position.set(0, 20, 0);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(clientWidth, clientHeight);
    document.body.appendChild(renderer.domElement);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    const controls = new PointerLockControls(camera, document.body);

    function toVoxelSpace(pos) {
        return pos.clone().sub(boxCenter).add(boxSize.clone().divideScalar(2));
    }

    function toWorldSpace(pos) {
        return pos.clone().sub(boxSize.clone().divideScalar(2)).add(boxCenter);
    }

    function cameraCast(r) {
        const cameraRay = new THREE.Raycaster();
        cameraRay.setFromCamera({ x: 0, y: 0 }, camera);
        const ray = r ? r : cameraRay.ray;
        const voxelBoxDist = rayBoxDist(boxCenter.clone().sub(boxSize.clone().divideScalar(2)), boxCenter.clone().add(boxSize.clone().divideScalar(2)), ray);
        const distToBox = voxelBoxDist.x;
        const distInsideBox = voxelBoxDist.y;
        const startPos = toVoxelSpace(ray.origin.clone().add(ray.direction.clone().multiplyScalar(distToBox)));
        //const endPos = toVoxelSpace(ray.origin + (distToBox + distInsideBox) * ray.direction);
        // console.log(cameraRay.ray);
        const voxelPos = new THREE.Vector3(Math.floor(startPos.x), Math.floor(startPos.y), Math.floor(startPos.z));
        const deltaDist = new THREE.Vector3(Math.abs(ray.direction.length() / ray.direction.x), Math.abs(ray.direction.length() / ray.direction.y), Math.abs(ray.direction.length() / ray.direction.z));
        const rayStep = new THREE.Vector3(Math.sign(ray.direction.x), Math.sign(ray.direction.y), Math.sign(ray.direction.z));
        const sideDist = rayStep.clone().multiply(voxelPos.clone().sub(startPos));
        sideDist.add(rayStep.clone().multiplyScalar(0.5));
        sideDist.addScalar(0.5);
        sideDist.multiply(deltaDist);
        let mask = new THREE.Vector3(false, false, false);
        let normal = new THREE.Vector3();
        for (let i = 0; i < Math.ceil(distInsideBox * 2.0); i++) {
            if (voxelPos.x < -1.0 || voxelPos.x > boxSize.x + 1.0 || voxelPos.y < -1.0 ||
                voxelPos.y > boxSize.y + 1.0 || voxelPos.z < -1.0 || voxelPos.z > boxSize.z + 1.0) {
                break;
            }
            const idx = (voxelPos.z * (boxSize.y * boxSize.x) + voxelPos.y * (boxSize.x) + voxelPos.x) * 4;
            if (data[idx + 3] > 0 && data[idx + 3] !== 4) {
                if (mask.x) {
                    normal = new THREE.Vector3(-Math.sign(rayStep.x), 0.0, 0.0);
                } else if (mask.y) {
                    normal = new THREE.Vector3(0.0, -Math.sign(rayStep.y), 0.0);
                } else {
                    normal = new THREE.Vector3(0.0, 0.0, -Math.sign(rayStep.z));
                }
                break;
            }
            if (sideDist.x < sideDist.y) {
                if (sideDist.x < sideDist.z) {
                    sideDist.x += deltaDist.x;
                    voxelPos.x += rayStep.x;
                    mask = new THREE.Vector3(true, false, false);
                } else {
                    sideDist.z += deltaDist.z;
                    voxelPos.z += rayStep.z;
                    mask = new THREE.Vector3(false, false, true);
                }
            } else {
                if (sideDist.y < sideDist.z) {
                    sideDist.y += deltaDist.y;
                    voxelPos.y += rayStep.y;
                    mask = new THREE.Vector3(false, true, false);
                } else {
                    sideDist.z += deltaDist.z;
                    voxelPos.z += rayStep.z;
                    mask = new THREE.Vector3(false, false, true);
                }
            }
        }
        return {
            startPos,
            voxelPos,
            normal
        }
    }
    let numpadSelect = 1;
    document.addEventListener('click', function(e) {

        controls.lock();
        if (controls.isLocked) {
            const { normal, voxelPos, startPos } = cameraCast();
            /// const numpadSelect = Math.min(...Object.entries(keys).filter(([key, value]) => Number.isInteger(+key) && value).map(x => +x[0]));
            const type = e.button !== 2 ? 0 : numpadSelect;
            const placePos = type === 0 ? voxelPos : voxelPos.clone().add(normal);
            if (startPos.distanceTo(placePos) > 15) {
                return;
            }
            if (placePos.x <= 0 || placePos.x >= boxSize.x - 1.0 || placePos.y <= 0.0 ||
                placePos.y >= boxSize.y - 1.0 || placePos.z <= 0.0 || placePos.z >= boxSize.z - 1.0) {
                return;
            }
            if (startPos.clone().floor().equals(placePos)) {
                return;
            }
            const idx = (placePos.z * (boxSize.y * boxSize.x) + placePos.y * (boxSize.x) + placePos.x) * 4;
            const blockToPlace = [0.5, 0.5, 0.5, type];
            if (type === 1) {
                blockToPlace[0] = 0;
                blockToPlace[1] = 0.5 + 0.5 * Math.random();
                blockToPlace[2] = 0;
            } else if (type === 2) {
                let factor = 0.75 + 0.5 * Math.random()
                blockToPlace[0] = (161 / 255) * factor;
                blockToPlace[1] = (103 / 255) * factor;
                blockToPlace[2] = (60 / 255) * factor;
            } else if (type === 3) {
                let factor = 0.5 + 0.25 * Math.random();
                blockToPlace[0] = factor;
                blockToPlace[1] = factor;
                blockToPlace[2] = factor;
            } else if (type === 4) {
                let factor = 0.5 + 0.25 * Math.random();
                blockToPlace[0] = factor * 0.25;
                blockToPlace[1] = factor * 0.5;
                blockToPlace[2] = factor;
            } else if (type === 5) {
                let trunkHue = 0.25 + 0.75 / 2;
                let factor = (0.75 + 0.5 * Math.random()) * trunkHue;
                blockToPlace[0] = (161 / 255) * factor;
                blockToPlace[1] = (103 / 255) * factor;
                blockToPlace[2] = (60 / 255) * factor;
            } else if (type === 6) {
                let leafHue = 0.25 + 0.75 / 2;
                let factor = 0.5 + 0.25 * Math.random();
                factor *= leafHue;
                blockToPlace[0] = factor * 0.25;
                blockToPlace[1] = factor;
                blockToPlace[2] = factor * 0.25;
            }
            data[idx] = blockToPlace[0];
            data[idx + 1] = blockToPlace[1];
            data[idx + 2] = blockToPlace[2];
            data[idx + 3] = blockToPlace[3];
            const placeTexture = new THREE.DataTexture3D(new Float32Array(blockToPlace), 1, 1, 1);
            placeTexture.format = THREE.RGBAFormat;
            placeTexture.type = THREE.FloatType;
            placeTexture.minFilter = THREE.NearestFilter;
            placeTexture.magFilter = THREE.NearestFilter;
            placeTexture.needsUpdate = true;
            renderer.copyTextureToTexture3D(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)), placePos.floor(), placeTexture, texture);
        }

    });
    //controls.target.set(0, 25, 0);

    const stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);
    // Setup scene
    // Skybox
    const environment = new THREE.CubeTextureLoader().load([
        "skybox/Box_Right.bmp",
        "skybox/Box_Left.bmp",
        "skybox/Box_Top.bmp",
        "skybox/Box_Bottom.bmp",
        "skybox/Box_Front.bmp",
        "skybox/Box_Back.bmp"
    ]);
    scene.background = environment;
    // Lighting
    const ambientLight = new THREE.AmbientLight(new THREE.Color(1.0, 1.0, 1.0), 0.25);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.35);
    directionalLight.position.set(150, 200, 50);
    // Shadows
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.left = -75;
    directionalLight.shadow.camera.right = 75;
    directionalLight.shadow.camera.top = 75;
    directionalLight.shadow.camera.bottom = -75;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.bias = -0.001;
    directionalLight.shadow.blurSamples = 8;
    directionalLight.shadow.radius = 4;
    scene.add(directionalLight);
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.15);
    directionalLight2.color.setRGB(1.0, 1.0, 1.0);
    directionalLight2.position.set(-50, 200, -150);
    scene.add(directionalLight2);
    const boxCenter = new THREE.Vector3(0, 1, 0);
    const boxSize = new THREE.Vector3(514, 102, 514);
    const data = new Float32Array(boxSize.x * boxSize.y * boxSize.z * 4);
    noise.seed(Math.random());
    const grassTex = new THREE.TextureLoader().load("grasstex.jpeg");
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    const dirtTex = new THREE.TextureLoader().load("dirttex.jpeg");
    dirtTex.wrapS = THREE.RepeatWrapping;
    dirtTex.wrapT = THREE.RepeatWrapping;
    const stoneTex = new THREE.TextureLoader().load("stonetex.jpeg");
    stoneTex.wrapS = THREE.RepeatWrapping;
    stoneTex.wrapT = THREE.RepeatWrapping;
    const woodTex = new THREE.TextureLoader().load("woodtex.png");
    woodTex.wrapS = THREE.RepeatWrapping;
    woodTex.wrapT = THREE.RepeatWrapping;
    const leafTex = new THREE.TextureLoader().load("leaftex.jpeg");
    leafTex.wrapS = THREE.RepeatWrapping;
    leafTex.wrapT = THREE.RepeatWrapping;
    const waterNormalMap = new THREE.TextureLoader().load("waternormal.jpeg");
    const waterNormalMap2 = new THREE.TextureLoader().load("waternormal2.png");
    waterNormalMap.wrapS = THREE.RepeatWrapping;
    waterNormalMap.wrapT = THREE.RepeatWrapping;
    waterNormalMap2.wrapS = THREE.RepeatWrapping;
    waterNormalMap2.wrapT = THREE.RepeatWrapping;
    for (let z = 0; z < boxSize.z; z++) {
        for (let y = 0; y < boxSize.y; y++) {
            for (let x = 0; x < boxSize.x; x++) {
                const idx = (z * (boxSize.y * boxSize.x) + y * (boxSize.x) + x) * 4;
                if (!(z === 0 || z === (boxSize.z - 1) || y === 0 || y === (boxSize.y - 1) || x === 0 || x === (boxSize.z - 1))) {
                    let height = 0;
                    for (let i = 0; i < 3; i++) {
                        height += 10 / (2 ** i) * noise.simplex2(z * 0.01 * (2 ** i), x * 0.01 * (2 ** i));
                    }
                    height = Math.round(height);
                    if (y < 53 + height && y >= 50 + height) {
                        data[idx] = 0;
                        data[idx + 1] = 0.5 + 0.5 * Math.random();
                        data[idx + 2] = 0;
                        data[idx + 3] = 1;
                    } else if (y >= 43 + height && y <= 50 + height) {
                        let factor = 0.75 + 0.5 * Math.random()
                        data[idx] = (161 / 255) * factor;
                        data[idx + 1] = (103 / 255) * factor;
                        data[idx + 2] = (60 / 255) * factor;
                        data[idx + 3] = 2;
                    } else if (y < 43 + height) {
                        let factor = 0.5 + 0.25 * Math.random();
                        data[idx] = factor;
                        data[idx + 1] = factor;
                        data[idx + 2] = factor;
                        data[idx + 3] = 3;
                    }
                    if (y < 50 && data[idx + 3] === 0) {
                        let factor = 0.5 + 0.25 * Math.random();
                        data[idx] = factor * 0.25;
                        data[idx + 1] = factor * 0.5;
                        data[idx + 2] = factor;
                        data[idx + 3] = 4;
                    }
                }
            }
        }
    }
    for (let i = 0; i < 500; i++) {
        let randomX = Math.round(6 + Math.random() * (boxSize.x - 12));
        let randomZ = Math.round(6 + Math.random() * (boxSize.z - 12));
        let placeY = 1;
        for (let y = 1; y < boxSize.y; y++) {
            const idx = (randomZ * (boxSize.y * boxSize.x) + y * (boxSize.x) + randomX) * 4;
            if (data[idx + 3] === 0 && data[idx + 3 - boxSize.x * 4] === 1) {
                placeY = y;
                break;
            }
        }
        const idx = (randomZ * (boxSize.y * boxSize.x) + placeY * (boxSize.x) + randomX) * 4;
        let factor = 0.75 + 0.5 * Math.random()
        data[idx] = (161 / 255) * factor;
        data[idx + 1] = (103 / 255) * factor;
        data[idx + 2] = (60 / 255) * factor;
        data[idx + 3] = 5;
        let height = Math.round(4 + Math.random() * 2);
        let trunkHue = 0.25 + 0.75 * Math.random();
        for (let i = 1; i <= height; i++) {
            let factor = (0.75 + 0.5 * Math.random()) * trunkHue;
            data[idx + i * boxSize.x * 4] = (161 / 255) * factor;
            data[idx + 1 + i * boxSize.x * 4] = (103 / 255) * factor;
            data[idx + 2 + i * boxSize.x * 4] = (60 / 255) * factor;
            data[idx + 3 + i * boxSize.x * 4] = 5;
        }
        let leafHeight = Math.floor(Math.random() * 3);
        let leaf2Height = Math.floor(Math.random() * 2);
        let leafHue = 0.25 + 0.75 * Math.random();
        for (let z = randomZ - 2; z < randomZ + 3; z++) {
            for (let y = (placeY + height + leafHeight) - 2; y < (placeY + height + leafHeight) + 2; y++) {
                for (let x = randomX - 2; x < randomX + 3; x++) {
                    if (!(z <= 0 || z >= (boxSize.z - 1) || y <= 0 || y >= (boxSize.y - 1) || x <= 0 || x >= (boxSize.z - 1))) {
                        const idx = (z * (boxSize.y * boxSize.x) + y * (boxSize.x) + x) * 4;
                        if (data[idx + 3] !== 5) {
                            let factor = 0.5 + 0.25 * Math.random();
                            factor *= leafHue;
                            data[idx] = factor * 0.25;
                            data[idx + 1] = factor;
                            data[idx + 2] = factor * 0.25;
                            data[idx + 3] = 6;
                        }
                    }
                }
            }
        }
        for (let z = randomZ - 1; z < randomZ + 2; z++) {
            for (let y = (placeY + height + leafHeight + leaf2Height) - 2; y < (placeY + height + leafHeight + leaf2Height) + 3; y++) {
                for (let x = randomX - 1; x < randomX + 2; x++) {
                    if (!(z <= 0 || z >= (boxSize.z - 1) || y <= 0 || y >= (boxSize.y - 1) || x <= 0 || x >= (boxSize.z - 1))) {
                        const idx = (z * (boxSize.y * boxSize.x) + y * (boxSize.x) + x) * 4;
                        if (data[idx + 3] !== 5) {
                            let factor = 0.5 + 0.25 * Math.random();
                            factor *= leafHue;
                            data[idx] = factor * 0.25;
                            data[idx + 1] = factor;
                            data[idx + 2] = factor * 0.25;
                            data[idx + 3] = 6;
                        }
                    }
                }
            }
        }
    }
    let texture = new THREE.DataTexture3D(data, boxSize.x, boxSize.y, boxSize.z);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    // Build postprocessing stack
    // Render Targets
    const defaultTexture = new THREE.WebGLRenderTarget(clientWidth, clientWidth, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter
    });
    defaultTexture.depthTexture = new THREE.DepthTexture(clientWidth, clientWidth, THREE.FloatType);
    // Post Effects
    const composer = new EffectComposer(renderer);
    const smaaPass = new SMAAPass(clientWidth, clientHeight);
    const effectPass = new ShaderPass(EffectShader);
    composer.addPass(effectPass);
    composer.addPass(smaaPass);
    let keys = {};
    document.onkeydown = (e) => {
        if (Number.isInteger(+e.key) && +e.key > 0) {
            numpadSelect = +e.key;
        }
        keys[e.key] = true;
    };
    document.onkeyup = (e) => {
        keys[e.key] = false;
    };

    let lastTime = performance.now();

    function animate() {
        renderer.setRenderTarget(defaultTexture);
        renderer.clear();
        renderer.render(scene, camera);
        const delta = performance.now() - lastTime;
        lastTime = performance.now();
        effectPass.uniforms["sceneDiffuse"].value = defaultTexture.texture;
        effectPass.uniforms["skybox"].value = environment;
        effectPass.uniforms["projMat"].value = camera.projectionMatrix;
        effectPass.uniforms["viewMat"].value = camera.matrixWorldInverse;
        effectPass.uniforms["projectionMatrixInv"].value = camera.projectionMatrixInverse;
        effectPass.uniforms["viewMatrixInv"].value = camera.matrixWorld;
        effectPass.uniforms["cameraPos"].value = camera.getWorldPosition(new THREE.Vector3());
        effectPass.uniforms['resolution'].value = new THREE.Vector2(clientWidth, clientHeight);
        effectPass.uniforms['time'].value = performance.now() / 1000;
        effectPass.uniforms['voxelTex'].value = texture;
        effectPass.uniforms['atlas'].value = [grassTex, dirtTex, stoneTex, woodTex, leafTex];
        effectPass.uniforms['boxCenter'].value = boxCenter;
        effectPass.uniforms['boxSize'].value = boxSize;
        effectPass.uniforms['waterNormal'].value = waterNormalMap;
        effectPass.uniforms['waterNormal2'].value = waterNormalMap2;
        composer.render();
        //controls.update();
        let speed = 0.25;
        const directionVector = new THREE.Vector3();
        if (keys["w"]) {
            directionVector.add(new THREE.Vector3(0, 0, -(delta / 16.666)).applyQuaternion(camera.quaternion));
        }
        if (keys["s"]) {
            directionVector.add(new THREE.Vector3(0, 0, (delta / 16.666)).applyQuaternion(camera.quaternion));
        }
        if (keys["a"]) {
            directionVector.add(new THREE.Vector3(-(delta / 16.666), 0, 0).applyQuaternion(camera.quaternion));
        }
        if (keys["d"]) {
            directionVector.add(new THREE.Vector3((delta / 16.666), 0, 0).applyQuaternion(camera.quaternion));
        }
        if (keys["q"]) {
            directionVector.add(new THREE.Vector3(0, (delta / 16.666), 0).applyQuaternion(camera.quaternion));
        }
        if (keys["e"]) {
            directionVector.add(new THREE.Vector3(0, -(delta / 16.666), 0).applyQuaternion(camera.quaternion));
        }
        directionVector.normalize().multiplyScalar(speed);
        if (directionVector.length() > 0) {
            let i;
            for (i = 0; i < 5; i++) {
                if (directionVector.length() === 0) {
                    break;
                }
                const daRay = new THREE.Ray(camera.position, directionVector.clone().normalize());
                const { normal, voxelPos } = cameraCast(daRay);
                const hitPos = toWorldSpace(voxelPos);
                const voxelIntersectData = rayBoxDist(hitPos.clone().floor(), hitPos.clone().addScalar(1.0), daRay);
                const intersectPos = daRay.origin.clone().add(daRay.direction.clone().multiplyScalar(voxelIntersectData.x));
                if (camera.position.distanceTo(intersectPos) < 0.5) {
                    if (normal.x !== 0) {
                        directionVector.x *= 0.0;
                    } else if (normal.y !== 0) {
                        directionVector.y *= 0.0;
                    } else if (normal.z !== 0) {
                        directionVector.z *= 0.0;
                    }
                } else {
                    break;
                }
            }
        }
        camera.position.add(directionVector);
        stats.update();
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}
main();