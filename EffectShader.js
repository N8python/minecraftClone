import * as THREE from 'https://cdn.skypack.dev/pin/three@v0.137.0-X5O2PK3x44y1WRry67Kr/mode=imports/optimized/three.js';
const EffectShader = {

    uniforms: {

        'sceneDiffuse': { value: null },
        'skybox': { value: null },
        'projMat': { value: new THREE.Matrix4() },
        'viewMat': { value: new THREE.Matrix4() },
        'projectionMatrixInv': { value: new THREE.Matrix4() },
        'viewMatrixInv': { value: new THREE.Matrix4() },
        'cameraPos': { value: new THREE.Vector3() },
        'resolution': { value: new THREE.Vector2() },
        'time': { value: 0.0 },
        'voxelTex': { value: null },
        'atlas': { value: null },
        'boxCenter': { value: new THREE.Vector3() },
        'boxSize': { value: new THREE.Vector3() },
        'waterNormal': { value: null },
        'waterNormal2': { value: null }
    },

    vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,

    fragmentShader: /* glsl */ `
    precision highp sampler3D;
		uniform sampler2D sceneDiffuse;
    uniform sampler2D[5] atlas;
    uniform sampler2D waterNormal;
    uniform sampler2D waterNormal2;
    uniform sampler3D voxelTex;
    uniform samplerCube skybox;
    uniform vec3 boxCenter;
    uniform vec3 boxSize;
    uniform mat4 projMat;
    uniform mat4 viewMat;
    uniform mat4 viewMatrixInv;
    uniform mat4 projectionMatrixInv;
    uniform vec3 cameraPos;
    uniform vec2 resolution;
    uniform float time;
        varying vec2 vUv;
        struct Ray {
          vec3 origin;
          vec3 direction;
      };
      struct RayHit {
        vec3 pos;
        vec3 normal;
        vec4 data;
        bool hit;
      };
      Ray createRay(vec3 origin, vec3 direction) {
        Ray ray;
        ray.origin = origin;
        ray.direction = direction;
        return ray;
    }
      RayHit createRayHit(vec3 pos, vec3 normal, vec4 data, bool hit) {
        RayHit result;
        result.pos = pos;
        result.normal = normal;
        result.data = data;
        result.hit = hit;
        return result;
      }
        Ray createCameraRay(vec2 uv) {
          vec3 origin = (viewMatrixInv * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 direction = (projectionMatrixInv * vec4(uv, 0.0, 1.0)).xyz;
          direction = (viewMatrixInv * vec4(direction, 0.0)).xyz;
          direction = normalize(direction);
          return createRay(origin, direction);
      }
        vec2 rayBoxDist(vec3 boundsMin, vec3 boundsMax, Ray ray) {
          vec3 t0 = (boundsMin - ray.origin) / ray.direction;
          vec3 t1 = (boundsMax - ray.origin) / ray.direction;
          vec3 tmin = min(t0, t1);
          vec3 tmax = max(t0, t1);

          float distA = max(max(tmin.x, tmin.y), tmin.z);
          float distB = min(tmax.x, min(tmax.y, tmax.z));

          float distToBox = max(0.0, distA);
          float distInsideBox = max(0.0, distB - distToBox);
          return vec2(distToBox, distInsideBox);
      }
      bool inBounds(vec3 minn, vec3 maxx, vec3 p) {
        return p.x >= minn.x && p.y >= minn.y && p.z >= minn.z && p.x <= maxx.x && p.y <= maxx.y && p.z <= maxx.z;
      }
    vec3 toVoxelSpace(vec3 pos) {
      pos -= boxCenter;
      pos += boxSize / 2.0;
      return pos;
    }
    vec3 toWorldSpace(vec3 pos) {
      pos -= boxSize / 2.0;
      pos += boxCenter;
      return pos;
    }
    RayHit voxelCast(vec3 startPos, Ray ray, float dist, float noHit) {
      vec3 voxelPos = floor(startPos);
      vec3 deltaDist = abs(vec3(length(ray.direction)) / ray.direction);
      vec3 rayStep = vec3(sign(ray.direction));
      vec3 sideDist = (sign(ray.direction) * (voxelPos - startPos) + (sign(ray.direction) * 0.5) + 0.5) * deltaDist; 

      bvec3 mask;
      for (float i = 0.0; i < ceil(dist * 2.0); i++) {
        if (voxelPos.x < -1.0 || voxelPos.x > boxSize.x + 1.0 || voxelPos.y < -1.0
        || voxelPos.y > boxSize.y + 1.0 || voxelPos.z < -1.0 || voxelPos.z > boxSize.z + 1.0) {
          break;
        }
        mask = lessThanEqual(sideDist.xyz, min(sideDist.yzx, sideDist.zxy));
        sideDist += vec3(mask) * deltaDist;
        voxelPos += vec3(mask) * rayStep;
        vec4 c = texture(voxelTex, voxelPos / boxSize);
        if (c.w > 0.0 && c.w != noHit) {
          vec3 normal = vec3(0.0);
          if (mask.x) {
            normal = vec3(-sign(rayStep.x), 0.0, 0.0);
          } else if (mask.y) {
            normal = vec3(0.0, -sign(rayStep.y), 0.0);
          } else {
            normal = vec3(0.0, 0.0, -sign(rayStep.z));
          }
          return createRayHit(voxelPos, normal, c, true);
        }
      }

      return createRayHit(vec3(0.0, 0.0, 0.0), vec3(0.0, 0.0, 0.0), vec4(0.0, 0.0, 0.0, 0.0), false);
    }
    RayHit raycast(Ray ray, float mask) {
      vec2 voxelBoxDist = rayBoxDist(boxCenter - boxSize / 2.0, boxCenter + boxSize / 2.0, ray);
      float distToBox = voxelBoxDist.x;
      float distInsideBox = voxelBoxDist.y;
      vec3 startPos = toVoxelSpace(ray.origin + distToBox * ray.direction);
      vec3 endPos = toVoxelSpace(ray.origin + (distToBox + distInsideBox) * ray.direction);
      RayHit result = voxelCast(startPos, ray, distInsideBox, mask);
      return result;
    }
    vec3 voxelIntersectPos(vec3 voxel, Ray ray) {
      vec3 hitPos = toWorldSpace(voxel);
      vec2 voxelIntersectData = rayBoxDist(floor(hitPos), hitPos + vec3(1.0, 1.0, 1.0), ray);
      vec3 intersectPos = ray.origin + ray.direction * voxelIntersectData.x;
      return intersectPos;
    }
    float vertexAO(bool side1, bool side2, bool corner) {
      if (side1 && side2) {
        return 0.0;
      }
      return 1.0 - float(side1) * 0.33 - float(side2) * 0.33 - float(corner) * 0.33;
    }
    vec3 colorCombine(vec4 col1, vec4 col2, vec4 col3, vec4 col4) {
      return (col1.rgb * sign(col1.w) + col2.rgb * sign(col2.w) + col3.rgb * sign(col3.w) + col4.rgb * sign(col4.w)) / (sign(col1.w) + sign(col2.w) + sign(col3.w) + sign(col4.w));
    }
    float voxelAO(vec3 sampleCenter, vec3 side1, vec3 side2, vec2 texCoord) {
      bool corner1 = texture(voxelTex, (sampleCenter - side1 - side2) / boxSize).w > 0.0;
      bool side11 = texture(voxelTex, (sampleCenter - side1) / boxSize).w > 0.0;
      bool side21 = texture(voxelTex, (sampleCenter - side2) / boxSize).w > 0.0;
      bool corner2 = texture(voxelTex, (sampleCenter + side1 - side2) / boxSize).w > 0.0;
      bool side12 = texture(voxelTex, (sampleCenter + side1) / boxSize).w > 0.0;
      bool side22 = texture(voxelTex, (sampleCenter - side2) / boxSize).w > 0.0;
      bool corner3 = texture(voxelTex, (sampleCenter + side1 + side2) / boxSize).w > 0.0;
      bool side13 = texture(voxelTex, (sampleCenter + side1) / boxSize).w > 0.0;
      bool side23 = texture(voxelTex, (sampleCenter + side2) / boxSize).w > 0.0;
      bool corner4 = texture(voxelTex, (sampleCenter - side1 + side2) / boxSize).w > 0.0;
      bool side14 = texture(voxelTex, (sampleCenter - side1) / boxSize).w > 0.0;
      bool side24 = texture(voxelTex, (sampleCenter + side2) / boxSize).w > 0.0;
      float vertex1 = vertexAO(side11, side21, corner1);
      float vertex2 = vertexAO(side12, side22, corner2);
      float vertex3 = vertexAO(side13, side23, corner3);
      float vertex4 = vertexAO(side14, side24, corner4);
      float ao = mix(mix(vertex1, vertex2, texCoord.x), mix(vertex4, vertex3, texCoord.x), texCoord.y);
      return ao;
    }
    vec3 voxelColor(vec3 sampleCenter, vec3 side1, vec3 side2, vec2 texCoord) {
      vec4 voxelCenter = texture(voxelTex, (sampleCenter) / boxSize);
      /*if (voxelCenter.w == 4.0) {
        return voxelCenter.rgb;
      }*/
      vec4 corner1 = texture(voxelTex, (sampleCenter - side1 - side2) / boxSize);
      if (voxelCenter.w == 4.0 && corner1.w != 4.0) {
        corner1.w = 0.0;
      }
      vec4 side11 = texture(voxelTex, (sampleCenter - side1) / boxSize);
      if (voxelCenter.w == 4.0 && side11.w != 4.0) {
        side11.w = 0.0;
      }
      vec4 side21 = texture(voxelTex, (sampleCenter - side2) / boxSize);
      if (voxelCenter.w == 4.0 && side21.w != 4.0) {
        side21.w = 0.0;
      }
      vec4 corner2 = texture(voxelTex, (sampleCenter + side1 - side2) / boxSize);
      if (voxelCenter.w == 4.0 && corner2.w != 4.0) {
        corner2.w = 0.0;
      }
      vec4 side12 = texture(voxelTex, (sampleCenter + side1) / boxSize);
      if (voxelCenter.w == 4.0 && side12.w != 4.0) {
        side12.w = 0.0;
      }
      vec4 side22 = texture(voxelTex, (sampleCenter - side2) / boxSize);
      if (voxelCenter.w == 4.0 && side22.w != 4.0) {
        side22.w = 0.0;
      }
      vec4 corner3 = texture(voxelTex, (sampleCenter + side1 + side2) / boxSize);
      if (voxelCenter.w == 4.0 && corner3.w != 4.0) {
        corner3.w = 0.0;
      }
      vec4 side13 = texture(voxelTex, (sampleCenter + side1) / boxSize);
      if (voxelCenter.w == 4.0 && side13.w != 4.0) {
        side13.w = 0.0;
      }
      vec4 side23 = texture(voxelTex, (sampleCenter + side2) / boxSize);
      if (voxelCenter.w == 4.0 && side23.w != 4.0) {
        side23.w = 0.0;
      }
      vec4 corner4 = texture(voxelTex, (sampleCenter - side1 + side2) / boxSize);
      if (voxelCenter.w == 4.0 && corner4.w != 4.0) {
        corner4.w = 0.0;
      }
      vec4 side14 = texture(voxelTex, (sampleCenter - side1) / boxSize);
      if (voxelCenter.w == 4.0 && side14.w != 4.0) {
        side14.w = 0.0;
      }
      vec4 side24 = texture(voxelTex, (sampleCenter + side2) / boxSize);
      if (voxelCenter.w == 4.0 && side24.w != 4.0) {
        side24.w = 0.0;
      }
      vec3 vertex1 = colorCombine(side11, side21, corner1, voxelCenter);
      vec3 vertex2 = colorCombine(side12, side22, corner2, voxelCenter);
      vec3 vertex3 = colorCombine(side13, side23, corner3, voxelCenter);
      vec3 vertex4 = colorCombine(side14, side24, corner4, voxelCenter);
      vec3 color = mix(mix(vertex1, vertex2, texCoord.x), mix(vertex4, vertex3, texCoord.x), texCoord.y);
      return color;
    }
    void calcTexCoord(vec3 normal, vec3 center, vec3 intersectPos, out vec2 texCoord, out vec3 side1, out vec3 side2) {
      if (abs(normal.x) == 1.0) {
        side1 = vec3(0.0, 0.0, 1.0);
        side2 = vec3(0.0, 1.0, 0.0);
        texCoord = vec2((toVoxelSpace(intersectPos) - center).zy);
      }
      if (abs(normal.y) == 1.0) {
        side1 = vec3(1.0, 0.0, 0.0);
        side2 = vec3(0.0, 0.0, 1.0);
        texCoord = vec2((toVoxelSpace(intersectPos) - center).xz);
      }
      if (abs(normal.z) == 1.0) {
        side1 = vec3(1.0, 0.0, 0.0);
        side2 = vec3(0.0, 1.0, 0.0);
        texCoord = vec2((toVoxelSpace(intersectPos) - center).xy);
      }
      texCoord += 0.5;
    }
    mat3 GetTangentSpace(vec3 normal)
    {
        // Choose a helper vector for the cross product
        vec3 helper = vec3(1.0, 0.0, 0.0);
        if (abs(normal.x) > 0.99)
            helper = vec3(0.0, 0.0, 1.0);
        // Generate vectors
        vec3 tangent = normalize(cross(normal, helper));
        vec3 binormal = normalize(cross(normal, tangent));
        return mat3(tangent, binormal, normal);
    }
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //  x0 = x0 - 0. + 0.0 * C 
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1. + 3.0 * C.xxx;

// Permutations
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients
// ( N*N points uniformly over a square, mapped onto an octahedron.)
  float n_ = 1.0/7.0; // N=7
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}
vec3 calculateColor(RayHit result, vec3 normal, vec3 intersectPos, vec3 shadeNormal, Ray ray) {
  vec3 center = result.pos + vec3(0.5, 0.5, 0.5);
  vec2 texCoord;
  vec3 side1;
  vec3 side2;
  calcTexCoord(normal, center, intersectPos, texCoord, side1, side2);
  vec3 sampleCenter = center + normal;
  float ao = voxelAO(sampleCenter, side1, side2, texCoord);
  vec3 lightDir = normalize(vec3(0.7, 0.8, 0.5));
  vec3 albedo = voxelColor(center, side1, side2, texCoord);
  float directLight = 0.6 * clamp(dot(lightDir, shadeNormal), 0.0, 1.0);
  if (result.data.w != 4.0) {
    Ray shadowRay = createRay(intersectPos + normal * 0.01, lightDir);
    if (raycast(shadowRay, 4.0).hit) {
      directLight *= 0.0;
    }
  }
  float contrastLight = 0.15 * clamp(dot(-lightDir, shadeNormal), 0.0, 1.0);
  float ambientLight = 0.25;
  float illumination = ambientLight + contrastLight + directLight;
  vec2 worldSampleCoord;
  if (abs(normal.y) == 1.0) {
    worldSampleCoord = intersectPos.xz;
  } else if (abs(normal.x) == 1.0) {
    worldSampleCoord = intersectPos.zy;
  } else {
    worldSampleCoord = intersectPos.xy;
  }
  float sampleIndex = floor(result.data.w);
  vec3 textureColor = vec3(-1.0);
  if (sampleIndex == 1.0) {
    textureColor = texture2D(atlas[0], worldSampleCoord * 0.25).rgb;
  } else if (sampleIndex == 2.0) {
    textureColor = texture2D(atlas[1], worldSampleCoord * 0.25).rgb;
  } else if (sampleIndex == 3.0) {
    textureColor = texture2D(atlas[2], worldSampleCoord * 0.25).rgb;
  } else if (sampleIndex == 5.0) {
    textureColor = texture2D(atlas[3], worldSampleCoord * 0.25).rgb;
  } else if (sampleIndex == 6.0) {
    textureColor = texture2D(atlas[4], worldSampleCoord * 0.25).rgb;
  }
  albedo = mix(albedo, textureColor, textureColor.x == -1.0 ? 0.0 : 0.5);
  return albedo * illumination * (0.175 + 0.825 * ao);
}
		void main() {
            vec4 diffuse = texture2D(sceneDiffuse, vUv);
            vec2 uv = vec2((gl_FragCoord.xy) / resolution) * 2.0 - 1.0;
            Ray ray = createCameraRay(uv);
            bool inWater = texture2D(voxelTex, toVoxelSpace(ray.origin) / boxSize).w == 4.0;
            if (inWater) {
              vec3 normal = (viewMatrixInv * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
              vec2 scaledUv = vec2(vUv.x * (resolution.x / resolution.y), vUv.y);
              vec3 normalMap = texture2D(waterNormal, scaledUv + time * 0.01).xyz;
              vec3 normalMap2 = texture2D(waterNormal2, scaledUv - time * 0.01).xyz;
              normalMap = normalMap * 2.0 - 1.0;
              normalMap2 = normalMap2 * 2.0 - 1.0;
              mat3 TBN = GetTangentSpace(normal);
              normal = normalize(mix(normal, normalize(mix(normalize(TBN * normalMap), normalize(TBN * normalMap2), snoise(vec3(scaledUv.x, time * 0.5, scaledUv.y)))), 0.1));
              ray.direction = refract(ray.direction, normal, 1.0 / 1.3);
            }
            RayHit result = raycast(ray, inWater ? 4.0 : -1.0);
            if (result.hit) {
              vec3 intersectPos = voxelIntersectPos(result.pos, ray);
              vec3 normal = result.normal;
              vec2 worldSampleCoord;
              if (abs(normal.y) == 1.0) {
                worldSampleCoord = intersectPos.xz;
              } else if (abs(normal.x) == 1.0) {
                worldSampleCoord = intersectPos.zy;
              } else {
                worldSampleCoord = intersectPos.xy;
              }
              if (result.data.w == 4.0) {
                vec3 normalMap = texture2D(waterNormal, worldSampleCoord * 0.1 + time * 0.01).xyz;
                vec3 normalMap2 = texture2D(waterNormal2, worldSampleCoord * 0.1 - time * 0.01).xyz;
                normalMap = normalMap * 2.0 - 1.0;
                normalMap2 = normalMap2 * 2.0 - 1.0;
                mat3 TBN = GetTangentSpace(normal);
                normal = normalize(mix(normal, normalize(mix(normalize(TBN * normalMap), normalize(TBN * normalMap2), snoise(vec3(intersectPos.x, time * 0.5, intersectPos.z)))), 0.25));
              }
              vec3 albedo = calculateColor(result, result.normal, intersectPos, normal, ray);
              if (result.data.w == 4.0) {
                Ray reflectionRay = createRay(intersectPos, reflect(ray.direction, normal));
                Ray refractionRay = createRay(intersectPos, refract(ray.direction, normal, 1.0 / 1.3));
                RayHit rc = raycast(reflectionRay, 4.0);
                RayHit rrc = raycast(refractionRay, 4.0);
                vec3 reflectedColor;
                vec3 refractedColor;
                if (rc.hit && rc.data.w != 4.0) {
                  vec3 intersectPosR = voxelIntersectPos(rc.pos, reflectionRay);
                  reflectedColor = calculateColor(rc, rc.normal, intersectPosR, rc.normal, reflectionRay);
                } else {
                  reflectedColor = texture(skybox, reflectionRay.direction).rgb;
                }
                if (rrc.hit && rrc.data.w != 4.0) {
                  vec3 intersectPosR = voxelIntersectPos(rrc.pos, refractionRay);
                  refractedColor = calculateColor(rrc, rrc.normal, intersectPosR, rrc.normal, refractionRay);
                } else {
                  refractedColor = texture(skybox, refractionRay.direction).rgb;
                }
                reflectedColor *= 2.0;
                refractedColor *= 2.0;
                float theta = max( dot( -ray.direction, normal ), 0.0 );
                float reflectance = 0.02 + ( 1.0 - 0.02 ) * pow( ( 1.0 - theta ), 5.0 );
                albedo = mix(albedo, mix(refractedColor, reflectedColor, reflectance), 0.5);
              }
              if (inWater) {
                albedo = mix(albedo, vec3(0.25, 0.5, 1.0), 1.0 - exp(-0.05 * distance(intersectPos, cameraPos)));
              }
              gl_FragColor = vec4(albedo, 1.0);
            } else {
              vec3 albedo = texture2D(sceneDiffuse, vUv).rgb;
              if (inWater) {
                albedo = mix(albedo, vec3(0.25, 0.5, 1.0), 0.5);
              }
              gl_FragColor = vec4(albedo, 1.0);
            }
		}`

};

export { EffectShader };