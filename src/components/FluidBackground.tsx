'use client';

import React, { useEffect, useRef } from 'react';

const VS = `attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FS = `#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2  u_res;
uniform float u_time;
uniform float u_seed;
uniform float u_scale;
uniform float u_warp;
uniform int u_lens;
uniform float u_lensAmt;
uniform float u_sym;
uniform float u_pixel;
uniform float u_dots;
uniform float u_dot;
uniform float u_dither;
uniform float u_grain;
uniform int   u_pal;
uniform vec3  u_c0;
uniform vec3  u_c1;
uniform vec3  u_c2;
uniform vec3  u_c3;
uniform sampler2D u_tex;
uniform float u_hasTex;
uniform float u_texAspect;
uniform float u_liq;
uniform float u_mix;
uniform float u_split;
uniform int   u_field;
uniform int   u_field2;
uniform int   u_blend;
uniform float u_layerMix;
uniform int   u_field3;
uniform int   u_blend2;
uniform float u_layerMix2;
uniform int   u_screen;
uniform int   u_material;
uniform sampler2D u_glyph;
uniform sampler2D u_mask;
uniform float u_hasMask;
uniform vec3  u_maskBg;
uniform vec3  u_maskBg2;
uniform float u_maskGrad;
uniform vec2  u_pan;
uniform vec2  u_mouse;
uniform float u_mouseAmt;
uniform int   u_mouseMode;
uniform float u_rec;

float hash(vec2 p){
  p = fract(p * 0.3183099 + fract(u_seed * 0.1031) + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * (p.x + p.y));
}
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for(int i = 0; i < 5; i++){
    v += a * vnoise(p);
    p = p * 2.03 + vec2(11.7, 5.9);
    a *= 0.5;
  }
  return v;
}

vec2 hash22(vec2 p){
  return vec2(hash(p), hash(p + vec2(37.2, 17.3)));
}

vec2 hexCenter(vec2 p){
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return p - gv;
}

vec2 fgrad(vec2 p, vec2 off){
  float e = 0.06;
  float gx = fbm(p + vec2(e, 0.0) + off) - fbm(p - vec2(e, 0.0) + off);
  float gy = fbm(p + vec2(0.0, e) + off) - fbm(p - vec2(0.0, e) + off);
  return vec2(gx, gy) / (2.0 * e);
}
float spreadF(float v, float g){ return clamp((v - 0.5) * g + 0.5, 0.0, 1.0); }
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b){ float d = dot(b, b) + 1e-6; return vec2(dot(a, b), a.y * b.x - a.x * b.y) / d; }
float fieldFlow(vec2 p, float t){
  float amt = 0.6 + u_warp * 0.25;
  vec2 wa = vec2(fbm(p * 0.6 + 11.0), fbm(p * 0.6 + 27.0)) - 0.5;
  vec2 wb = vec2(fbm(p * 0.9 + 41.0), fbm(p * 0.9 + 63.0)) - 0.5;
  vec2 sp = p + wa * (1.1 * sin(t * 0.13)) + wb * (1.0 * cos(t * 0.091));
  vec2 g = fgrad(sp, vec2(0.0));
  vec2 curl = vec2(g.y, -g.x);
  return spreadF(fbm(p + curl * amt), 2.0);
}

float fieldCellular(vec2 p, float t){
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float f1 = 9.0; float f2 = 9.0;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(ip + g);
      o = 0.5 + 0.5 * sin(t * 0.5 + 6.2831 * o);
      vec2 d = g + o - fp;
      float dd = dot(d, d);
      if (dd < f1){ f2 = f1; f1 = dd; }
      else if (dd < f2){ f2 = dd; }
    }
  }
  f1 = sqrt(f1); f2 = sqrt(f2);
  float cells = 1.0 - f1;
  float edges = f2 - f1;
  return mix(cells, edges, clamp(u_warp / 9.0, 0.0, 1.0));
}
float fieldGyroid(vec2 p, float t){
  vec3 q = vec3(p * 1.4, t * 0.3);
  float g = sin(q.x) * cos(q.y) + sin(q.y) * cos(q.z) + sin(q.z) * cos(q.x);
  g += (0.15 + u_warp * 0.12) * sin(2.0 * g + length(p));
  return 0.5 + 0.5 * sin(g * 1.6);
}

float truchetCell(vec2 p, float h){
  vec2 fp = fract(p);
  if (h < 0.5){ fp.x = 1.0 - fp.x; }
  float d = min(length(fp), length(fp - 1.0));
  d = abs(d - 0.5);
  float bands = 4.0 + u_warp * 2.5;
  return 0.5 + 0.5 * cos(d * bands * 6.2831853 - u_time * 1.5);
}
float fieldTruchet(vec2 p, float t){ return truchetCell(p, hash(floor(p))); }

float fieldInterf(vec2 p, float t){
  float v = 0.0;
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    vec2 c = 1.2 * vec2(sin(t * 0.2 + fi * 1.7), cos(t * 0.17 + fi * 2.3));
    float freq = 5.0 + u_warp * 2.0 + fi * 1.6;
    v += sin(length(p - c) * freq - t * 1.2 + fi);
  }
  return 0.5 + 0.5 * (v / 4.0);
}

float fieldKaleido(vec2 p, float t){
  float ang = atan(p.y, p.x);
  float rad = length(p);
  float sectors = 3.0 + floor(u_warp * 0.7);
  float seg = 6.2831853 / sectors;
  ang = mod(ang, seg);
  ang = abs(ang - 0.5 * seg);
  vec2 q = vec2(cos(ang), sin(ang)) * rad;
  return spreadF(fbm(q * 1.6 + vec2(t * 0.35, t * 0.12)), 1.6);
}

float fieldLines(vec2 p, float t){
  float ang = u_warp * 0.35;
  float c = cos(ang), s = sin(ang);
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float freq = 5.0 + u_warp * 1.4;
  return 0.5 + 0.5 * sin(q.x * freq + t * 0.6 + 0.6 * sin(q.y * 0.7 + t * 0.5));
}

float fieldGrid(vec2 p, float t){
  float freq = 4.0 + u_warp * 1.4;
  float gx = sin(p.x * freq + t * 0.5);
  float gy = sin(p.y * freq - t * 0.5);
  float lines = max(gx, gy);
  float nodes = gx * gy;
  return spreadF(0.5 + 0.5 * mix(lines, nodes, 0.35), 1.5);
}

float fieldGolden(vec2 p, float t){
  float r = length(p) * (1.3 + u_warp * 0.18);
  float a = atan(p.y, p.x);
  float n = r * r;
  float spiral = cos(a - n * 2.39996323 + t * 0.55);
  float rings = cos(n * 3.14159265 - t * 0.28);
  return 0.5 + 0.5 * spiral * rings;
}
float fieldSmoke(vec2 p, float t){
  float w = max(u_warp, 1.0);
  vec2 a1 = vec2(sin(t * 0.2), cos(t * 0.17)) * 0.8;
  vec2 a2 = vec2(cos(t * 0.15), sin(t * 0.24)) * 0.8;
  vec2 q = vec2(fbm(p + a1), fbm(p + vec2(5.2, 1.3) - a2));
  vec2 r = vec2(fbm(p + w * 0.42 * q + vec2(1.7, 9.2) + a2),
               fbm(p + w * 0.42 * q + vec2(8.3, 2.8) - a1));
  float body = fbm(p + w * 0.5 * r);
  float fine = fbm(p * 2.4 + r * 1.6 + a1 * 0.4);
  float d = body * 0.72 + fine * 0.28;
  return pow(clamp((d - 0.15) * 1.65, 0.0, 1.0), 1.6);
}

float fieldQuasi(vec2 p, float t){
  float n = 5.0 + floor(u_warp * 0.6);
  float v = 0.0;
  for (int i = 0; i < 12; i++){
    float on = step(float(i), n - 0.5);
    float a = 3.14159265 * float(i) / max(n, 1.0);
    v += on * cos((p.x * cos(a) + p.y * sin(a)) * 8.0 + t * 0.65);
  }
  return spreadF(0.5 + 0.5 * (v / n), 1.5);
}

float fieldHoneycomb(vec2 p, float t){
  vec2 hp = p * (1.3 + u_warp * 0.35);
  vec2 c = hexCenter(hp);
  vec2 gv = hp - c;
  float hd = max(abs(gv.x), max(abs(0.5 * gv.x + 0.8660254 * gv.y), abs(-0.5 * gv.x + 0.8660254 * gv.y)));
  float cell = 0.5 + 0.5 * sin(hash(c) * 6.2831853 + t * 0.7);
  float wall = smoothstep(0.40, 0.48, hd);
  return mix(cell, 0.04, wall);
}

vec3 ramp4(float t, vec3 a, vec3 b, vec3 c, vec3 d){
  t = clamp(t, 0.0, 1.0);
  vec3 col = mix(a, b, smoothstep(0.0, 0.34, t));
  col = mix(col, c, smoothstep(0.33, 0.67, t));
  col = mix(col, d, smoothstep(0.66, 1.0, t));
  return col;
}
vec3 palChrome(float f){
  float band = sin(f * 22.0);
  vec3 c = vec3(0.10 + 0.82 * f) * (0.78 + 0.22 * band);
  float edge = pow(1.0 - abs(band), 4.0);
  vec3 sheen = 0.5 + 0.5 * cos(6.28318 * (f * 3.0 + vec3(0.0, 0.33, 0.67)));
  return c + sheen * edge * 0.22;
}

vec2 bloomAnchor(int i, float t){
  float fi = float(i);
  float aa = u_seed * 0.61803 + fi * 2.399963;
  float rr = 1.05 + 0.35 * sin(u_seed * 1.3 + fi * 2.1);
  vec2 base = vec2(cos(aa), sin(aa)) * rr;
  float w1 = 0.05 + 0.023 * fi;
  float w2 = 0.041 + 0.017 * fi;
  return base + vec2(sin(t * w1 + aa * 3.0), cos(t * w2 + aa * 1.7)) * 0.45;
}
vec4 bloomW(vec2 p, float t){
  vec2 q = p + (vec2(fbm(p * 0.7 + t * 0.04), fbm(p * 0.7 + vec2(4.1, 7.7) - t * 0.03)) - 0.5) * u_warp * 0.35;
  vec4 w;
  w.x = exp(-dot(q - bloomAnchor(0, t), q - bloomAnchor(0, t)) * 1.4);
  w.y = exp(-dot(q - bloomAnchor(1, t), q - bloomAnchor(1, t)) * 1.4);
  w.z = exp(-dot(q - bloomAnchor(2, t), q - bloomAnchor(2, t)) * 1.4);
  w.w = exp(-dot(q - bloomAnchor(3, t), q - bloomAnchor(3, t)) * 1.4);
  return w / max(w.x + w.y + w.z + w.w, 0.0008);
}
float fieldBloom(vec2 p, float t){
  vec4 w = bloomW(p, t);
  return dot(w, vec4(0.02, 0.35, 0.68, 0.98));
}
float fieldSweep(vec2 p, float t){
  vec2 uv = p / (u_scale * 3.0);
  float tt = dot(uv, vec2(0.7071, -0.7071)) / 1.4142 + 0.5;
  float wob = (fbm(p * 0.9 + vec2(t * 0.05, 3.7 - t * 0.04)) - 0.5) * u_warp * 0.12;
  return clamp(tt + wob, 0.0, 1.0);
}
float fieldMarble(vec2 p, float t){
  vec2 a = vec2(sin(t * 0.11), cos(t * 0.09)) * 0.6;
  vec2 q = vec2(fbm(p * 0.9 + a), fbm(p * 0.9 + vec2(3.1, 7.3) - a));
  vec2 r = vec2(fbm(p * 1.3 + 2.2 * q + vec2(6.4, 1.9)),
               fbm(p * 1.3 + 2.2 * q + vec2(0.7, 8.8)));
  float band = sin((p.y + (r.x - 0.5) * u_warp * 1.6) * 5.0 + r.y * 4.0 + t * 0.15);
  return 0.5 + 0.5 * band;
}
float plaidSett(float x, float t){
  float s = 0.45 * sin(x + t) + 0.35 * sin(x * 3.0 - t * 0.7) + 0.20 * sin(x * 7.0 + t * 0.4);
  return 0.5 + 0.5 * s;
}
float fieldPlaid(vec2 p, float t){
  vec2 q = p * (1.4 + u_warp * 0.35);
  float sx = plaidSett(q.x, t * 0.25);
  float sy = plaidSett(q.y, t * 0.20);
  float over = 0.5 + 0.5 * sin(q.x * 6.0) * sin(q.y * 6.0);
  float v = mix(max(sx, sy), sx * sy, 0.4) * (0.82 + 0.18 * over);
  return spreadF(clamp(v, 0.0, 1.0), 1.3);
}
float fieldCurtain(vec2 p, float t){
  vec2 q = vec2(p.x * 1.6, p.y * 0.35);
  float ruff = fbm(vec2(q.x * 1.8 + t * 0.10, q.y + t * 0.05)) - 0.5;
  float x = q.x + ruff * u_warp * 0.5 + sin(q.y * 1.3 + t * 0.22) * 0.35;
  float ridge = pow(1.0 - abs(sin(x * 2.2 + t * 0.10)), 2.2);
  float glow = fbm(vec2(x * 0.7, q.y * 0.8 - t * 0.07));
  return clamp(ridge * 0.85 + glow * 0.35, 0.0, 1.0);
}
float stitchSegD(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a; vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h);
}
float fieldStitch(vec2 p, float t){
  float rot = t * 0.05 + u_seed * 0.13;
  float k = 0.85 + u_warp * 0.9 + fract(u_seed * 0.377) * 0.7 + 0.6 * sin(t * 0.07);
  float lenO = length(p);
  if (lenO > 1.1){ p *= 1.21 / dot(p, p); }
  float minD = 9.0; float glow = 0.0;
  for (int i = 0; i < 64; i++){
    float a = float(i) * 0.09817477;
    vec2 A = 1.1 * vec2(cos(a + rot), sin(a + rot));
    vec2 B = 1.1 * vec2(cos(k * a + rot), sin(k * a + rot));
    float d = stitchSegD(p, A, B);
    minD = min(minD, d);
    glow += exp(-d * 22.0);
  }
  float thread = 1.0 - smoothstep(0.0, 0.045, minD);
  float caust = 1.0 - exp(-glow * 0.3);
  float v = 0.12 + 0.62 * caust + 0.34 * thread;
  float rim = exp(-abs(lenO - 1.1) * 24.0);
  v = max(v, rim * 0.9);
  return clamp(v, 0.0, 1.0);
}
float fieldPursuit(vec2 p, float t){
  float nf = 3.0 + mod(floor(u_seed + 0.5), 4.0);
  float an = 3.14159265 / nf;
  float c = cos(2.0 * an), sn = sin(2.0 * an);
  float fr = 0.03 + u_warp * 0.04;
  float fmax = 0.5 - sqrt(max(0.25 - 0.1638 / (1.0 - c), 0.0));
  float f = min(fr, fmax);
  float phi = atan(f * sn / (1.0 - f + f * c));
  float s = sqrt(1.0 - 2.0 * f * (1.0 - f) * (1.0 - c));
  float r = length(p), a0 = atan(p.y, p.x);
  float th = u_seed * 0.7853 + t * 0.12;
  float dth = phi + (fr - f) * 1.2 + t * 0.0072;
  float A = 2.3 * cos(an);
  float minD = 1000.0, depth = 0.0;
  for (int j = 0; j < 22; j++){
    float b = mod(a0 - th + an, 2.0 * an) - an;
    float sd = r * cos(b) - A;
    minD = min(minD, abs(sd));
    depth += step(sd, 0.0);
    th += dth; A *= s;
  }
  float v = 0.05 + 0.028 * depth + 0.20 * exp(-minD * 6.0) + 0.22 * exp(-r * r * 1.5);
  return clamp(mix(v, 1.0, smoothstep(0.05, 0.012, minD) * 0.95), 0.0, 1.0);
}
float chlPlate(vec2 q, float m, float n, float s){
  float a = cos(m * 3.14159265 * q.x) * cos(n * 3.14159265 * q.y);
  float b = cos(n * 3.14159265 * q.x) * cos(m * 3.14159265 * q.y);
  return (a - b) + s * (a + b);
}
float fieldChladni(vec2 p, float t){
  vec2 q = p * 0.5 + vec2(fract(u_seed * 0.127), fract(u_seed * 0.211));
  float m = 1.0 + floor(u_warp * 0.6);
  float n = m + 2.0;
  float s = 0.35 * fract(u_seed * 0.61);
  float a = t * 0.13 + u_seed * 0.9;
  float u = cos(a) * chlPlate(q, m, n, s) + sin(a) * chlPlate(q, m + 1.0, n + 1.0, s);
  float L = 1.0 - smoothstep(0.0, 0.07 + 0.05 * m, abs(u));
  return clamp(L * 0.80 + 0.40 * (0.5 + 0.45 * u), 0.0, 1.0);
}
vec2 casFocus(int i, float t){
  float fi = float(i);
  float aa = u_seed * 0.7853 + fi * 2.399963;
  float rr = (0.5 + 0.3 * sin(u_seed * 1.7 + fi * 2.6)) * (0.8 + u_warp * 0.06);
  float w1 = 0.083 + 0.034 * fi;
  float w2 = 0.107 + 0.027 * fi;
  return vec2(cos(aa), sin(aa)) * rr + vec2(sin(t * w1 + aa * 2.1), cos(t * w2 + aa * 1.3)) * 0.4;
}
float fieldCassini(vec2 p, float t){
  float phi = log(length(p - casFocus(0, t)) + 0.05)
            + log(length(p - casFocus(1, t)) + 0.05)
            + log(length(p - casFocus(2, t)) + 0.05)
            + log(length(p - casFocus(3, t)) + 0.05);
  phi *= 0.25;
  float v = 0.5 + 0.5 * cos(phi * (0.6 + u_warp * 1.8) - t * 0.55);
  return spreadF(v, 1.4);
}
float fieldTopo(vec2 p, float t){
  vec2 drift = vec2(t * 0.035, -t * 0.022);
  vec2 q = vec2(fbm(p * 0.8 + drift), fbm(p * 0.8 + vec2(4.7, 2.3) - drift));
  float h = fbm(p * 0.85 + (q - 0.5) * (u_warp * 0.55) + drift * 0.6);
  float e = (h - 0.18) * 1.55;
  float lv = e * 14.0;
  float fr = fract(lv);
  float dist = min(fr, 1.0 - fr);
  float w = max(fwidth(lv), 0.0008);
  float line = 1.0 - smoothstep(0.0, w * 1.4, dist);
  float major = step(mod(floor(lv + 0.5), 5.0), 0.5);
  line = max(line, (1.0 - smoothstep(0.0, w * 2.6, dist)) * (0.75 * major));
  line *= 1.0 - smoothstep(0.22, 0.5, w);
  return clamp(line * (0.30 + 0.70 * clamp(e, 0.0, 1.0)), 0.0, 1.0);
}
vec2 eddyRowVel(vec2 p, vec2 c, float a, float g){
  float k = 3.14159265 / a;
  float xi = (p.x - c.x) * k;
  float eta = clamp((p.y - c.y) * k, -8.0, 8.0);
  float e = exp(2.0 * eta), ei = 1.0 / e;
  float sh = 0.5 * (e - ei), ch = 0.5 * (e + ei);
  float d = max(ch - cos(2.0 * xi), 1e-4);
  float s = g / (2.0 * a);
  return vec2(-s * sh / d, s * sin(2.0 * xi) / d);
}
float fieldEddy(vec2 p, float t){
  float a = 1.15;
  float h = 0.281 * a;
  float g = 0.22 + u_warp * 0.10;
  float U = 0.55;
  vec2 q = p;
  float tau = t;
  float dt = 0.20;
  for (int i = 0; i < 8; i++){
    float xs = tau * U;
    float breathe = 1.0 + 0.22 * sin(tau * 0.85);
    float yc = 0.13 * a * sin(tau * 0.55 + q.x * 0.6);
    float gt = g * breathe;
    vec2 v = vec2(U, 0.0);
    v += eddyRowVel(q, vec2(xs, yc + h), a, gt);
    v += eddyRowVel(q, vec2(xs + a * 0.5, yc - h), a, -gt);
    q -= v * dt;
    tau -= dt;
  }
  float streams = 0.5 + 0.5 * (q.y * 2.2 / (1.0 + abs(q.y * 2.2)));
  float striae = 0.5 + 0.5 * cos(q.y * 9.0);
  return clamp(mix(streams, striae, 0.30), 0.0, 1.0);
}

float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }

float fieldOf(int eng, vec2 p, float t, out vec2 disp){
  float d1 = 1.8 * sin(t * 0.12) + 1.2 * cos(t * 0.067);
  float d2 = 1.8 * cos(t * 0.10) + 1.2 * sin(t * 0.084);
  disp = vec2(0.5);
  if (eng == 1){ return fieldFlow(p, t); }
  else if (eng == 2){ return fieldCellular(p, t); }
  else if (eng == 3){ return fieldGyroid(p, t); }
  else if (eng == 4){ return fieldTruchet(p, t); }
  else if (eng == 5){ return fieldInterf(p, t); }
  else if (eng == 6){ return fieldKaleido(p, t); }
  else if (eng == 7){ return fieldLines(p, t); }
  else if (eng == 8){ return fieldGrid(p, t); }
  else if (eng == 9){ return fieldGolden(p, t); }
  else if (eng == 10){ return fieldSmoke(p, t); }
  else if (eng == 11){ return fieldQuasi(p, t); }
  else if (eng == 12){ return fieldHoneycomb(p, t); }
  else if (eng == 13){ return fieldBloom(p, t); }
  else if (eng == 14){ return fieldSweep(p, t); }
  else if (eng == 15){ return fieldMarble(p, t); }
  else if (eng == 16){ return fieldPlaid(p, t); }
  else if (eng == 17){ return fieldCurtain(p, t); }
  else if (eng == 18){ return fieldStitch(p, t); }
  else if (eng == 19){ return fieldPursuit(p, t); }
  else if (eng == 20){ return fieldChladni(p, t); }
  else if (eng == 21){ return fieldCassini(p, t); }
  else if (eng == 22){ return fieldTopo(p, t); }
  else if (eng == 23){ return fieldEddy(p, t); }
  vec2 m1 = vec2(d1, d2);
  vec2 m2 = vec2(d2, -d1);
  vec2 q = vec2(fbm(p + m1 * 0.5), fbm(p + vec2(5.2, 1.3) + m2 * 0.5));
  disp = vec2(
    fbm(p + u_warp * q + vec2(1.7, 9.2) + m1),
    fbm(p + u_warp * q + vec2(8.3, 2.8) + m2)
  );
  return spreadF(fbm(p + u_warp * disp), 1.5);
}

float blendField(float a, float b, int mode, float amt){
  float r;
  if (mode == 1){ r = a * b; }
  else if (mode == 2){ r = 1.0 - (1.0 - a) * (1.0 - b); }
  else if (mode == 3){ r = min(a + b, 1.0); }
  else if (mode == 4){ r = abs(a - b); }
  else if (mode == 5){ r = a < 0.5 ? 2.0 * a * b : 1.0 - 2.0 * (1.0 - a) * (1.0 - b); }
  else { r = b; }
  return mix(a, r, amt);
}

vec3 shadeMaterial(int mat, vec3 base, vec3 N, float fv){
  vec3 L = normalize(vec3(0.4, 0.7, 0.6));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float ndl = max(dot(N, L), 0.0);
  float ndh = max(dot(N, H), 0.0);
  float fres = pow(1.0 - max(N.z, 0.0), 2.5);
  vec3 col = base;
  if (mat == 1){
    col = base * (0.35 + 0.25 * ndl) + fres * (base + 0.7) + pow(ndh, 80.0) * 1.5;
  } else if (mat == 2){
    vec3 env = mix(base * 0.15 + 0.02, base * 0.7 + 0.55, smoothstep(-0.6, 0.6, N.y));
    col = env + pow(ndh, 40.0) * 2.0 + fres * 0.5;
  } else if (mat == 3){
    float ao = clamp(0.5 + 0.5 * N.z, 0.0, 1.0);
    col = base * (0.4 + 0.6 * ndl) * ao + (hash(gl_FragCoord.xy * 1.91) - 0.5) * 0.18;
  } else if (mat == 4){
    col = base * (0.5 + 0.4 * ndl) + pow(ndh, 28.0) * 1.3 + fres * 0.4 * (base + 0.3);
  } else if (mat == 5){
    float ph = fv * 12.56637;
    float s1 = 0.5 + 0.5 * sin(ph);
    float s2 = 0.5 + 0.5 * sin(ph * 2.618 + 1.7);
    float bands = pow(s1, 12.0) * 1.35 + pow(s2, 34.0) * 0.85;
    float sheen = pow(s1, 3.0) * 0.20;
    vec3 tint = base / max(max(base.r, max(base.g, base.b)), 0.12);
    col = base * 0.12 + 0.012
        + tint * (bands + sheen) * (0.75 + 0.25 * ndl)
        + tint * pow(ndh, 60.0) * 1.6
        + fres * tint * 0.15;
  } else if (mat == 6){
    vec2 g = N.xy;
    float gm = length(g);
    vec2 q = gl_FragCoord.xy / u_res.y;
    float da = fbm(q * 1.4 + 3.1) * 6.2832;
    vec2 tng = vec2(-g.y, g.x) / max(gm, 1e-4);
    vec2 dir = normalize(mix(vec2(cos(da), sin(da)), tng, smoothstep(0.03, 0.18, gm)));
    vec2 prp = vec2(-dir.y, dir.x);
    float h = 0.0, id = 0.0, rim = 0.0;
    vec2 hgl = vec2(0.0);
    for (int lyr = 0; lyr < 2; lyr++){
      float cs = lyr == 0 ? 0.060 : 0.040;
      vec2 cq = q / cs + float(lyr) * 0.37;
      vec2 ci = floor(cq);
      for (int j = -2; j <= 2; j++){
        for (int i = -2; i <= 2; i++){
          if (lyr == 1 && (i < -1 || i > 1 || j < -1 || j > 1)){ continue; }
          vec2 cell = ci + vec2(float(i), float(j));
          vec2 rn = hash22(cell + float(lyr) * 71.0);
          vec2 d = q - (cell + 0.25 + 0.5 * rn) * cs;
          float x = dot(d, dir), y = dot(d, prp);
          float hl = lyr == 0 ? cs * (1.3 + 0.7 * rn.x) : cs * (0.8 + 0.3 * rn.x);
          float hw = cs * (0.34 + 0.14 * rn.y);
          float ex = abs(x) / hl, ey = abs(y) / hw;
          if (ex > 1.0 || ey > 1.0){ continue; }
          float di = hash(cell * 1.7 + float(lyr) * 13.0);
          float ends = 1.0 - smoothstep(0.7, 1.0, ex);
          float prof = sqrt(max(1.0 - ey * ey, 0.0));
          float wob = vnoise(vec2(x / cs * 3.0 + di * 50.0, y / cs * 6.0 + di * 20.0));
          float rph = (y / hw * 1.5 + wob * 1.2) * 6.2832;
          float rid = 0.5 + 0.5 * sin(rph);
          float amp = 0.6 + 0.7 * di;
          float tex = 0.8 + 0.2 * rid;
          float hc = ends * prof * tex * amp;
          if (hc > h){
            h = hc; id = di; rim = max(ex, ey);
            float te = ex > 0.7 ? -222.2 * (ex - 0.7) * (1.0 - ex) : 0.0;
            float dEdx = te * sign(x) / hl;
            float dPdy = -ey / max(prof, 0.15) * sign(y) / hw;
            float dRdy = 0.2 * 0.5 * cos(rph) * 6.2832 * 1.5 / hw;
            hgl = amp * vec2(dEdx * prof * tex, ends * (dPdy * tex + prof * dRdy));
          }
        }
      }
    }
    vec2 hg = (hgl.x * dir + hgl.y * prp) * 0.012;
    vec3 Np = normalize(vec3(-hg, 1.0));
    float pdl = max(dot(Np, L), 0.0);
    float pdh = max(dot(Np, H), 0.0);
    float cover = smoothstep(0.04, 0.22, h);
    vec2 wv = q * u_res.y * 0.38;
    float weave = 0.5 + 0.25 * (sin(wv.x * 6.2832) + sin(wv.y * 6.2832)) * (0.7 + 0.3 * vnoise(wv));
    vec3 ground = base * (0.30 + 0.16 * weave) + 0.015;
    float id2 = fract(id * 57.3);
    vec3 pc = base * (0.74 + 0.5 * id) * vec3(1.0 + 0.12 * (id2 - 0.5), 1.0 - 0.05 * (id2 - 0.5), 1.0 - 0.12 * (id2 - 0.5));
    float ao = 1.0 - 0.32 * smoothstep(0.55, 1.0, rim);
    col = mix(ground, pc, cover) * ao;
    col = col * (0.62 + 0.42 * pdl) * (0.85 + 0.15 * ndl) * (0.72 + 0.28 * min(h * 1.6, 1.0))
        + cover * pow(pdh, 30.0) * 0.34 * ao + fres * 0.04;
  }
  return col;
}

void main(){
  if (u_hasTex > 0.5 && u_split > 0.001 && gl_FragCoord.x < u_res.x * u_split){
    vec2 st0 = gl_FragCoord.xy / u_res;
    float ca0 = u_res.x / u_res.y;
    vec2 t0 = st0 - 0.5;
    if (ca0 > u_texAspect){ t0.y *= u_texAspect / ca0; }
    else { t0.x *= ca0 / u_texAspect; }
    t0 += 0.5 + u_pan;
    gl_FragColor = vec4(texture2D(u_tex, clamp(t0, 0.0, 1.0)).rgb, 1.0);
    return;
  }

  float csA = max(u_pixel, 8.0);
  vec2 fc = gl_FragCoord.xy;
  if (u_screen == 1){
    float cs = max(u_pixel, 3.0);
    fc = hexCenter(fc / cs) * cs;
  } else if (u_screen == 2){
    fc = (floor(fc / csA) + 0.5) * csA;
  } else if (u_screen == 3){
    float cd = max(u_pixel, 3.0);
    fc = (floor(fc / cd) + 0.5) * cd;
  } else if (u_screen == 4){
    float cg = max(u_pixel, 4.0);
    fc = (floor(fc / cg) + 0.5) * cg;
  } else if (u_pixel > 1.5){
    fc = (floor(fc / u_pixel) + 0.5) * u_pixel;
  }

  float mn = sqrt(u_res.x * u_res.y);
  vec2 uv = (fc - 0.5 * u_res) / mn;
  vec2 p = uv * u_scale * 3.0;
  if (u_mouseAmt > 0.001 && u_mouseMode > 0){
    vec2 mUv = (u_mouse * u_res - 0.5 * u_res) / mn;
    vec2 dv = uv - mUv;
    float md = length(dv);
    if (u_mouseMode == 1){
      vec2 nz = vec2(fbm(dv * 6.0 + u_time * 0.3), fbm(dv * 6.0 + vec2(7.3, 2.1) - u_time * 0.25)) - 0.5;
      float env = exp(-md * 9.0);
      float wave = cos((md + nz.x * 0.12) * 30.0 - u_time * 2.0);
      vec2 dir = normalize(dv / max(md, 0.0008) + nz * 0.9);
      p += dir * wave * env * u_mouseAmt * 0.08;
    } else if (u_mouseMode == 2){
      float env = exp(-md * 5.0);
      p -= dv * env * u_mouseAmt * 0.5;
    } else if (u_mouseMode == 3){
      float angle = u_mouseAmt * 3.0 * exp(-md * 4.0);
      float ca = cos(angle), sa = sin(angle);
      p += vec2(dv.x * ca - dv.y * sa, dv.x * sa + dv.y * ca) - dv;
    } else if (u_mouseMode == 4){
      float env = exp(-md * 5.0);
      p += normalize(dv / max(md, 0.0008)) * env * u_mouseAmt * 0.28;
    }
  }

  vec2 disp = vec2(0.5);
  float f;
  if (u_sym >= 1.5){
    float ka = atan(p.y, p.x);
    float kr = length(p);
    float kseg = 6.2831853 / u_sym;
    ka = mod(ka, kseg);
    ka = abs(ka - 0.5 * kseg);
    p = vec2(cos(ka), sin(ka)) * kr;
  }

  if (u_lens > 0 && u_lensAmt > 0.001){
    float lsc = u_scale * 1.5;
    vec2 w = p / lsc;
    vec2 lw = w;
    if (u_lens == 1){
      lw = cmul(w, w) / max(length(w), 0.001);
    } else if (u_lens == 2){
      lw = w * (0.30 / max(dot(w, w), 0.004));
    } else if (u_lens == 3){
      vec2 a = vec2(cos(u_time * 0.07), sin(u_time * 0.09)) * 0.45;
      lw = cdiv(w - a, vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), w));
      lw = clamp(lw, -8.0, 8.0);
    } else if (u_lens == 4){
      vec2 lg = vec2(log(max(length(w), 0.003)), atan(w.y, w.x));
      lg = cmul(lg, vec2(0.92388, 0.38268));
      float dr = lg.y + u_time * 0.04;
      lw = exp(lg.x) * vec2(cos(dr), sin(dr));
    } else if (u_lens == 5){
      lw = w / (1.06 - min(dot(w, w), 1.0));
    } else if (u_lens == 6){
      float cp = u_seed * 2.4 + u_time * 0.02;
      vec2 c = vec2(cos(cp), sin(cp)) * 0.7885;
      vec2 z = w * 0.8;
      for (int k = 0; k < 7; k++){
        if (dot(z, z) > 4.0){ break; }
        z = cmul(z, z) + c;
      }
      lw = clamp(z, -2.0, 2.0);
    } else if (u_lens == 7){
      lw = cmul(cmul(w, w), w) / max(dot(w, w), 0.001);
    } else if (u_lens == 8){
      float ex = exp((w.x + 0.15 * sin(u_time * 0.09)) * 1.1) * 0.5;
      float ey = w.y * 2.0 + u_time * 0.03;
      lw = ex * vec2(cos(ey), sin(ey));
    } else if (u_lens == 9){
      vec2 q = vec2(w.x * 2.5, w.y * 1.6);
      float chy = (exp(q.y) + exp(-q.y)) * 0.5;
      float shy = (exp(q.y) - exp(-q.y)) * 0.5;
      lw = vec2(sin(q.x) * chy, cos(q.x) * shy) * 0.55;
    } else if (u_lens == 10){
      lw = w + 0.30 * w / max(dot(w, w), 0.02);
    } else if (u_lens == 11){
      float nph = u_seed * 1.3 + u_time * 0.05;
      vec2 nr = vec2(cos(nph), sin(nph));
      vec2 z = w * 1.4;
      for (int k = 0; k < 5; k++){
        vec2 z2 = cmul(z, z);
        z = z - cdiv(cmul(z, z2) - nr, 3.0 * z2);
        z = clamp(z, -3.0, 3.0);
      }
      lw = z;
    } else if (u_lens == 12){
      vec2 z = vec2(w.x * 1.4 + u_time * 0.02, abs(w.y * 1.4) + 0.08);
      for (int k = 0; k < 6; k++){
        z.x = z.x - floor(z.x + 0.5);
        float zz = dot(z, z);
        if (zz < 1.0){ z = vec2(-z.x, z.y) / max(zz, 0.01); }
      }
      lw = clamp(z, -4.0, 4.0);
    } else {
      float hz = 0.34;
      float depth = 0.55 / max(abs(hz - w.y), 0.02);
      lw = clamp(vec2(depth, w.x * depth), -60.0, 60.0);
    }
    p = mix(p, lw * lsc, u_lensAmt);
  }

  f = fieldOf(u_field, p, u_time, disp);
  float fb = f;
  if (u_layerMix > 0.001){
    vec2 disp2;
    f = blendField(f, fieldOf(u_field2, p, u_time, disp2), u_blend, u_layerMix);
  }
  if (u_layerMix2 > 0.001){
    vec2 disp3;
    f = blendField(f, fieldOf(u_field3, p, u_time, disp3), u_blend2, u_layerMix2);
  }
  if (u_hasTex > 0.5 && u_field != 0){
    float d1 = 1.8 * sin(u_time * 0.12) + 1.2 * cos(u_time * 0.067);
    float d2 = 1.8 * cos(u_time * 0.10) + 1.2 * sin(u_time * 0.084);
    disp = vec2(fbm(p + vec2(1.7, 9.2) + d1), fbm(p + vec2(8.3, 2.8) + d2));
  }
  f = smoothstep(0.08, 0.92, f);

  if (u_hasTex > 0.5){
    vec2 st = fc / u_res;
    float ca = u_res.x / u_res.y;
    vec2 tuv = st - 0.5;
    if (ca > u_texAspect){ tuv.y *= u_texAspect / ca; }
    else { tuv.x *= ca / u_texAspect; }
    tuv += 0.5 + u_pan;
    tuv += (disp - 0.5) * u_liq * 0.25;
    vec3 ts = texture2D(u_tex, clamp(tuv, 0.0, 1.0)).rgb;
    float lum = dot(ts, vec3(0.299, 0.587, 0.114));
    f = mix(f, lum, u_mix);
  }

  vec3 col;
  if (u_field == 13 && u_hasTex < 0.5 && u_pal != 7){
    vec4 bw = bloomW(p, u_time);
    col = bw.x * u_c0 + bw.y * u_c1 + bw.z * u_c2 + bw.w * u_c3;
  }
  else if (u_pal == 7){ col = palChrome(f); }
  else           { col = ramp4(f, u_c0, u_c1, u_c2, u_c3); }
  col += smoothstep(0.72, 1.0, f) * 0.12;

  if (u_material > 0){
    vec2 grd = vec2(dFdx(f), dFdy(f)) * u_res.y * 0.06;
    if (u_material == 6){
      vec2 dd; float pe = 0.05 * u_scale;
      float fx1 = fieldOf(u_field, p + vec2(pe, 0.0), u_time, dd);
      float fy1 = fieldOf(u_field, p + vec2(0.0, pe), u_time, dd);
      grd = vec2(fx1 - fb, fy1 - fb) * 6.0;
    }
    col = shadeMaterial(u_material, col, normalize(vec3(-grd, 1.0)), f);
  }

  if (u_dots > 0.5 && u_screen == 0){
    vec2 g = mod(gl_FragCoord.xy, u_dot) - 0.5 * u_dot;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float radius = 0.5 * u_dot * sqrt(clamp(lum, 0.0, 1.0)) * 0.92;
    float dm = 1.0 - smoothstep(radius - 0.8, radius + 0.8, length(g));
    col = mix(col * 0.12, col * 1.12, dm);
  }

  if (u_screen == 2){
    float lum = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    float gi = floor(lum * 9.999);
    vec2 cl = fract(gl_FragCoord.xy / csA);
    vec2 guv = vec2((gi + cl.x) / 10.0, 1.0 - cl.y);
    col *= texture2D(u_glyph, guv).r;
  }

  if (u_screen == 3){
    float cd = max(u_pixel, 3.0);
    float bit = step(bayer8(gl_FragCoord.xy / cd), clamp(f + (u_dither - 0.5), 0.0, 1.0));
    col = mix(u_c1, u_c3, bit);
  }

  if (u_screen == 4){
    float lev = clamp(0.5 + (u_dither - 0.5) * 0.6, 0.18, 0.82);
    float bw = 0.018;
    col = vec3(
      1.0 - smoothstep(bw, bw * 2.6, abs(f - (lev - 0.05))),
      1.0 - smoothstep(bw, bw * 2.6, abs(f - lev)),
      1.0 - smoothstep(bw, bw * 2.6, abs(f - (lev + 0.05)))
    );
  }

  float grPhase = mix(mod(floor(u_time * 10.0), 61.0) * 1.7, 23.0, u_rec);
  float gr = hash(gl_FragCoord.xy * 0.731 + grPhase) - 0.5;
  col += gr * u_grain * mix(1.0, 0.28, u_rec);
  col *= 1.0 - 0.22 * dot(uv, uv);

  if (u_hasMask > 0.5){
    float mk = texture2D(u_mask, vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y)).r;
    vec3 mbg = mix(u_maskBg, u_maskBg2, u_maskGrad * (1.0 - gl_FragCoord.y / u_res.y));
    col = mix(mbg, col, smoothstep(0.42, 0.58, mk));
  }

  gl_FragColor = vec4(col, 1.0);
}`;

const P = {
  speed: 0.88,
  scale: 1.06,
  warp: 1.7,
  sym: 0,
  pixel: 4,
  dots: 0,
  dot: 19,
  thresh: 0.47,
  grain: 0.044,
  pal: 4,
  cols: [
    [0.035, 0.02, 0.02],
    [0.49, 0.1, 0.1],
    [0.9, 0.45, 0.13],
    [0.98, 0.9, 0.72],
  ],
  field: 0,
  field2: 0,
  blend: 0,
  layerMix: 0,
  field3: 0,
  blend2: 0,
  layerMix2: 0,
  screen: 4,
  material: 0,
  seed: 35.4,
  lens: 1,
  lensAmt: 0.66,
};

export function FluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const gl =
      (cv.getContext('webgl', { antialias: false }) as WebGLRenderingContext | null) ||
      (cv.getContext('experimental-webgl', { antialias: false }) as WebGLRenderingContext | null);

    if (!gl) return;

    function sh(t: number, s: string) {
      const o = gl!.createShader(t);
      if (!o) return null;
      gl!.shaderSource(o, s);
      gl!.compileShader(o);
      return o;
    }

    gl.getExtension('OES_standard_derivatives');
    const pr = gl.createProgram();
    if (!pr) return;

    const vs = sh(gl.VERTEX_SHADER, VS);
    const fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;

    gl.attachShader(pr, vs);
    gl.attachShader(pr, fs);
    gl.linkProgram(pr);
    gl.useProgram(pr);

    const bf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );

    const al = gl.getAttribLocation(pr, 'a_pos');
    gl.enableVertexAttribArray(al);
    gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);

    const U: Record<string, WebGLUniformLocation | null> = {};
    'u_res u_time u_seed u_scale u_warp u_lens u_lensAmt u_sym u_pixel u_dots u_dot u_dither u_grain u_pal u_c0 u_c1 u_c2 u_c3 u_hasTex u_texAspect u_liq u_mix u_split u_field u_field2 u_blend u_layerMix u_field3 u_blend2 u_layerMix2 u_screen u_material u_glyph u_pan u_mouse u_mouseAmt u_rec u_mask u_hasMask u_maskBg'
      .split(' ')
      .forEach((n) => {
        U[n] = gl.getUniformLocation(pr, n);
      });

    function dt(u: number) {
      const t = gl!.createTexture();
      gl!.activeTexture(gl!.TEXTURE0 + u);
      gl!.bindTexture(gl!.TEXTURE_2D, t);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        1,
        1,
        0,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255])
      );
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    }
    dt(0);
    dt(2);

    (function () {
      const ch = ' .:-=+*#%@';
      const ce = 28;
      const c = document.createElement('canvas');
      c.width = ce * ch.length;
      c.height = ce;
      const x = c.getContext('2d');
      if (x) {
        x.fillStyle = '#000';
        x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = '#fff';
        x.font = 'bold ' + Math.round(ce * 0.82) + 'px monospace';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        for (let i = 0; i < ch.length; i++) {
          x.fillText(ch.charAt(i), i * ce + ce / 2, ce / 2 + 1);
        }
      }
      const t = gl!.createTexture();
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, t);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, false);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, c);
    })();

    gl.activeTexture(gl.TEXTURE0);
    if (U.u_glyph) gl.uniform1i(U.u_glyph, 1);
    if (U.u_mask) gl.uniform1i(U.u_mask, 2);
    if (U.u_seed) gl.uniform1f(U.u_seed, P.seed);
    if (U.u_scale) gl.uniform1f(U.u_scale, P.scale);
    if (U.u_warp) gl.uniform1f(U.u_warp, P.warp);
    if (U.u_sym) gl.uniform1f(U.u_sym, P.sym);
    if (U.u_dots) gl.uniform1f(U.u_dots, P.dots);
    if (U.u_dither) gl.uniform1f(U.u_dither, P.thresh);
    if (U.u_grain) gl.uniform1f(U.u_grain, P.grain);
    if (U.u_pal) gl.uniform1i(U.u_pal, P.pal);
    if (U.u_c0) gl.uniform3f(U.u_c0, P.cols[0][0], P.cols[0][1], P.cols[0][2]);
    if (U.u_c1) gl.uniform3f(U.u_c1, P.cols[1][0], P.cols[1][1], P.cols[1][2]);
    if (U.u_c2) gl.uniform3f(U.u_c2, P.cols[2][0], P.cols[2][1], P.cols[2][2]);
    if (U.u_c3) gl.uniform3f(U.u_c3, P.cols[3][0], P.cols[3][1], P.cols[3][2]);
    if (U.u_hasTex) gl.uniform1f(U.u_hasTex, 0);
    if (U.u_texAspect) gl.uniform1f(U.u_texAspect, 1);
    if (U.u_liq) gl.uniform1f(U.u_liq, 0);
    if (U.u_mix) gl.uniform1f(U.u_mix, 0);
    if (U.u_split) gl.uniform1f(U.u_split, 0);
    if (U.u_field) gl.uniform1i(U.u_field, P.field);
    if (U.u_field2) gl.uniform1i(U.u_field2, P.field2);
    if (U.u_blend) gl.uniform1i(U.u_blend, P.blend);
    if (U.u_layerMix) gl.uniform1f(U.u_layerMix, P.layerMix);
    if (U.u_field3) gl.uniform1i(U.u_field3, P.field3);
    if (U.u_blend2) gl.uniform1i(U.u_blend2, P.blend2);
    if (U.u_layerMix2) gl.uniform1f(U.u_layerMix2, P.layerMix2);
    if (U.u_screen) gl.uniform1i(U.u_screen, P.screen);
    if (U.u_material) gl.uniform1i(U.u_material, P.material);
    if (U.u_lens) gl.uniform1i(U.u_lens, P.lens || 0);
    if (U.u_lensAmt) gl.uniform1f(U.u_lensAmt, P.lensAmt == null ? 1 : P.lensAmt);
    if (U.u_pan) gl.uniform2f(U.u_pan, 0, 0);
    if (U.u_mouse) gl.uniform2f(U.u_mouse, 0.5, 0.5);
    if (U.u_mouseAmt) gl.uniform1f(U.u_mouseAmt, 0);
    if (U.u_rec) gl.uniform1f(U.u_rec, 0);
    if (U.u_hasMask) gl.uniform1f(U.u_hasMask, 0);
    if (U.u_maskBg) gl.uniform3f(U.u_maskBg, 0.05, 0.05, 0.06);

    let animationFrameId: number;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

    function rs() {
      if (!cv) return;
      const w = Math.round(cv.clientWidth * dpr);
      const h = Math.round(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      gl!.viewport(0, 0, cv.width, cv.height);
      if (U.u_res) gl!.uniform2f(U.u_res, cv.width, cv.height);
      if (U.u_pixel) gl!.uniform1f(U.u_pixel, P.pixel <= 1.5 ? 1.0 : P.pixel * dpr);
      if (U.u_dot) gl!.uniform1f(U.u_dot, P.dot * dpr);
    }

    window.addEventListener('resize', rs);
    rs();

    let st: number | null = null;
    function fr(now: number) {
      if (st === null) st = now;
      if (U.u_time) gl!.uniform1f(U.u_time, (now - st) * 0.001 * P.speed);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      animationFrameId = requestAnimationFrame(fr);
    }
    animationFrameId = requestAnimationFrame(fr);

    return () => {
      window.removeEventListener('resize', rs);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none -z-10 block"
      style={{ background: '#0d0d10' }}
    />
  );
}
