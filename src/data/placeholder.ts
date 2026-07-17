// Генератор data-URI плейсхолдеров (SVG) — без внешних зависимостей
export function ph(label: string, c1 = '#171717', c2 = '#3D3D3D', accent = false): string {
  const a = accent ? '#E7FE17' : '#8C8C8C'
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/>
    </linearGradient></defs>
    <rect width='400' height='500' fill='url(#g)'/>
    <circle cx='200' cy='210' r='70' fill='${a}' opacity='0.25'/>
    <rect x='120' y='320' width='160' height='14' rx='7' fill='${a}' opacity='0.4'/>
    <rect x='150' y='350' width='100' height='10' rx='5' fill='#ffffff' opacity='0.2'/>
    <text x='200' y='470' fill='#ffffff' opacity='0.5' font-family='Montserrat,sans-serif' font-size='18' text-anchor='middle'>${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
