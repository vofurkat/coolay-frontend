<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  data: number[]
  height?: number
}>()

const W = 600
const H = computed(() => props.height || 120)
const PAD = 6

const max = computed(() => Math.max(1, ...props.data))

const points = computed(() => {
  const n = props.data.length
  if (n === 0) return []
  const stepX = (W - PAD * 2) / Math.max(1, n - 1)
  return props.data.map((v, i) => {
    const x = PAD + i * stepX
    const y = H.value - PAD - (v / max.value) * (H.value - PAD * 2)
    return { x, y }
  })
})

const linePath = computed(() => {
  const pts = points.value
  if (pts.length === 0) return ''
  // плавная кривая (catmull-rom -> bezier)
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  return d
})

const areaPath = computed(() => {
  const pts = points.value
  if (pts.length === 0) return ''
  return `${linePath.value} L ${pts[pts.length - 1].x} ${H.value} L ${pts[0].x} ${H.value} Z`
})
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="w-full" :style="{ height: H + 'px' }">
    <defs>
      <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#E7FE17" stop-opacity="0.5" />
        <stop offset="100%" stop-color="#E7FE17" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="areaPath" fill="url(#spark-grad)" />
    <path :d="linePath" fill="none" stroke="#0A0A0A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    <circle
      v-for="(p, i) in points"
      :key="i"
      :cx="p.x"
      :cy="p.y"
      r="3"
      fill="#E7FE17"
      stroke="#0A0A0A"
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
      :opacity="data[i] > 0 ? 1 : 0"
    />
  </svg>
</template>
