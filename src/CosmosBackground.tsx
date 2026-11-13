import { useEffect, useRef } from 'react'

const vertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
uniform float u_aspect;
varying vec2 v_uv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += vec2(dot(p, p + vec2(45.32)));
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += vec3(dot(p, p.yzx + vec3(33.33)));
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash31(i);
  float b = hash31(i + vec3(1.0, 0.0, 0.0));
  float c = hash31(i + vec3(0.0, 1.0, 0.0));
  float d = hash31(i + vec3(1.0, 1.0, 0.0));
  float e = hash31(i + vec3(0.0, 0.0, 1.0));
  float f1 = hash31(i + vec3(1.0, 0.0, 1.0));
  float g = hash31(i + vec3(0.0, 1.0, 1.0));
  float h = hash31(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, f1, f.x), mix(g, h, f.x), f.y), f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += noise3(p) * amplitude;
    p = p * 2.03 + vec3(11.7);
    amplitude *= 0.5;
  }
  return value;
}

float craterField(vec3 p, float scale) {
  vec3 grid = p * scale;
  vec3 cell = floor(grid);
  vec3 local = fract(grid);
  vec3 center = vec3(
    hash31(cell + vec3(1.0, 2.0, 3.0)),
    hash31(cell + vec3(4.0, 5.0, 6.0)),
    hash31(cell + vec3(7.0, 8.0, 9.0))
  ) * 0.58 + 0.21;
  float seed = hash31(cell + vec3(17.0));
  float radius = 0.105 + seed * 0.105;
  float distanceToCenter = length((local - center) * vec3(1.0, 1.0, 0.78));
  float basin = 1.0 - smoothstep(radius * 0.48, radius, distanceToCenter);
  float rim = exp(-pow((distanceToCenter - radius * 0.96) / (radius * 0.17), 2.0));
  return basin * 0.15 - rim * 0.052;
}

vec3 rotateY(vec3 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}

float hitSphere(vec3 ray, vec3 center, float radius, out vec3 normal) {
  float along = dot(center, ray);
  float discriminant = along * along - dot(center, center) + radius * radius;
  if (discriminant < 0.0) return -1.0;
  float distance = along - sqrt(discriminant);
  if (distance < 0.0) distance = along + sqrt(discriminant);
  if (distance < 0.0) return -1.0;
  normal = normalize(ray * distance - center);
  return distance;
}

vec3 shadePlanet(vec3 normal, vec3 ray, float lunar) {
  vec3 surface = rotateY(normal, u_time * 0.055 + lunar * 0.7);
  float broad = fbm(surface * 5.2);
  float detail = fbm(surface * 27.0);
  float craters = craterField(surface, lunar > 0.5 ? 13.0 : 10.0) + craterField(surface, 31.0) * 0.34;
  float light = max(dot(normal, normalize(vec3(-0.52, 0.67, 0.9))), 0.0);
  float day = 0.17 + light * 0.9;
  vec3 color;

  if (lunar > 0.5) {
    float maria = smoothstep(0.43, 0.68, broad + detail * 0.2 + craters * 0.4);
    float albedo = 0.36 + broad * 0.14 + detail * 0.05 + craters;
    color = mix(vec3(0.29, 0.32, 0.31), vec3(0.52, 0.54, 0.51), albedo);
    color *= 1.0 - maria * 0.22;
    color *= day;
    float limb = pow(1.0 - max(dot(normal, -ray), 0.0), 3.4);
    color += vec3(0.18, 0.29, 0.29) * limb * 0.22;
  } else {
    float dust = broad * 0.55 + detail * 0.25 + craters;
    vec3 lowland = vec3(0.22, 0.074, 0.043);
    vec3 highland = vec3(0.61, 0.25, 0.12);
    color = mix(lowland, highland, clamp(dust + 0.18, 0.0, 1.0));
    color += vec3(0.12, 0.044, 0.018) * sin(surface.y * 24.0 + broad * 5.0) * 0.12;
    color *= day;
    float limb = pow(1.0 - max(dot(normal, -ray), 0.0), 3.1);
    color += vec3(0.43, 0.19, 0.105) * limb * 0.34;
  }

  return color;
}

float galaxy(vec2 point, vec2 center, float radius, float phase) {
  vec2 p = (point - center) / radius;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float arms = 0.5 + 0.5 * cos(angle * 3.0 - r * 9.0 + phase);
  float disk = exp(-r * 2.9) * (1.0 - smoothstep(0.74, 1.15, r));
  float core = exp(-r * 17.0);
  return disk * (0.24 + arms * 0.48) + core * 0.34;
}

void main() {
  vec2 point = (v_uv * 2.0 - 1.0) * vec2(u_aspect, 1.0);
  vec2 parallax = u_pointer * 0.012;
  vec3 color = vec3(0.012, 0.021, 0.024);

  vec2 firstGalaxyCenter = vec2(-u_aspect * 0.34, 0.45) + parallax;
  vec2 secondGalaxyCenter = vec2(u_aspect * 0.12, -0.75) - parallax * 0.7;
  float nebulaA = galaxy(point, firstGalaxyCenter, 0.47, 0.14);
  float nebulaB = galaxy(point, secondGalaxyCenter, 0.31, 1.8);
  color += vec3(0.047, 0.13, 0.15) * nebulaA;
  color += vec3(0.11, 0.045, 0.09) * nebulaB * 0.62;

  vec2 starGrid = v_uv * vec2(176.0 * u_aspect, 102.0);
  vec2 cell = floor(starGrid);
  vec2 local = fract(starGrid);
  float seed = hash21(cell);
  vec2 starOffset = vec2(hash21(cell + 3.4), hash21(cell + 8.2));
  float starRadius = mix(0.025, 0.14, hash21(cell + 2.7));
  float starDistance = length(local - starOffset);
  float star = (1.0 - smoothstep(starRadius * 0.15, starRadius, starDistance)) * step(0.976, seed);
  float twinkle = 0.64 + 0.36 * sin(u_time * (0.5 + seed * 1.5) + seed * 31.0);
  float brightStar = exp(-starDistance * starDistance / 0.0025) * step(0.9985, hash21(cell + 74.2));
  color += vec3(0.65, 0.79, 0.75) * star * twinkle * 0.72;
  color += vec3(0.45, 0.64, 0.67) * brightStar * (0.62 + 0.38 * twinkle);

  vec3 ray = normalize(vec3(point.x * 1.55, point.y * 1.55, -1.72));
  vec3 normal;
  float marsDistance = hitSphere(ray, vec3(u_aspect * 2.8 + sin(u_time * 0.045) * 0.035, 2.1 + cos(u_time * 0.036) * 0.026, -3.85), 0.63, normal);
  if (marsDistance > 0.0) color = shadePlanet(normal, ray, 0.0);
  else {
    vec3 marsCenter = vec3(u_aspect * 2.8 + sin(u_time * 0.045) * 0.035, 2.1 + cos(u_time * 0.036) * 0.026, -3.85);
    vec3 toMars = normalize(ray * max(dot(marsCenter, ray), 0.0) - marsCenter);
    float marsHalo = pow(1.0 - abs(dot(toMars, -ray)), 5.0) * step(0.0, dot(marsCenter, ray));
    color += vec3(0.15, 0.047, 0.022) * marsHalo * 0.11;
  }

  float moonDistance = hitSphere(ray, vec3(-u_aspect * 3.1 + cos(u_time * 0.032) * 0.025, 2.3 + sin(u_time * 0.028) * 0.022, -4.7), 0.52, normal);
  if (moonDistance > 0.0) color = shadePlanet(normal, ray, 1.0);

  float vignette = 1.0 - smoothstep(0.45, 1.45, length(point * vec2(0.72, 0.92)));
  color *= 0.72 + vignette * 0.28;
  gl_FragColor = vec4(color, 1.0);
}
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export default function CosmosBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' })
    if (!canvas || !gl) return

    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShader)
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader)
    if (!vertex || !fragment) return

    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program)
      return
    }

    const buffer = gl.createBuffer()
    if (!buffer) return
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    gl.useProgram(program)
    const position = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const aspectLocation = gl.getUniformLocation(program, 'u_aspect')
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    const pointerLocation = gl.getUniformLocation(program, 'u_pointer')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const targetPointer = { x: 0, y: 0 }
    const currentPointer = { x: 0, y: 0 }
    let frame = 0
    let lastFrame = 0
    let width = 0
    let height = 0
    let visible = !document.hidden

    const resize = () => {
      gl.useProgram(program)
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25)
      width = Math.max(1, Math.floor(window.innerWidth * ratio))
      height = Math.max(1, Math.floor(window.innerHeight * ratio))
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
      gl.uniform2f(resolutionLocation, width, height)
      gl.uniform1f(aspectLocation, width / height)
    }

    const draw = (timestamp: number) => {
      if (!visible) return
      if (timestamp - lastFrame < 33 && !reducedMotion) {
        frame = requestAnimationFrame(draw)
        return
      }
      lastFrame = timestamp
      gl.useProgram(program)
      currentPointer.x += (targetPointer.x - currentPointer.x) * 0.035
      currentPointer.y += (targetPointer.y - currentPointer.y) * 0.035
      gl.uniform1f(timeLocation, reducedMotion ? 0 : timestamp * 0.00012)
      gl.uniform2f(pointerLocation, currentPointer.x, currentPointer.y)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      if (!reducedMotion) frame = requestAnimationFrame(draw)
    }

    const onPointerMove = (event: PointerEvent) => {
      targetPointer.x = (event.clientX / window.innerWidth - 0.5) * 2
      targetPointer.y = (event.clientY / window.innerHeight - 0.5) * -2
    }
    const onVisibilityChange = () => {
      visible = !document.hidden
      if (visible && !reducedMotion) {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(draw)
      }
    }

    resize()
    if (reducedMotion) draw(0)
    else frame = requestAnimationFrame(draw)
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [])

  return <canvas ref={canvasRef} className="cosmos-canvas" aria-hidden="true" />
}