import { calcularPoligonal, ordenarPorAngulo } from '../src/lib/topo.js'
const pts = [{nome:'M0451',n:9108742.923,e:284999.477},{nome:'M0452',n:9108718.897,e:284960.406},{nome:'A',n:9108716.767,e:284989.427},{nome:'B',n:9108740.061,e:284973.009}]
const r = calcularPoligonal(pts); console.log('ordem do toque  -> perimetro', r.perimetro.toFixed(1), 'area', r.area.toFixed(0), 'cruzada:', r.cruzada)
const rc = calcularPoligonal(ordenarPorAngulo(pts)); console.log('ordem corrigida -> perimetro', rc.perimetro.toFixed(1), 'area', rc.area.toFixed(0), 'cruzada:', rc.cruzada)
