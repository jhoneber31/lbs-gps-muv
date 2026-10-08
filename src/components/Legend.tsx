export default function Legend({ suspicious }: { suspicious: boolean }) {
  return (
    <aside className="panel legend" aria-label="Leyenda">
      <h2>Leyenda</h2>
      <ul>
        <li><svg width="34" height="12"><line x1="2" y1="6" x2="32" y2="6" className="l-gps" strokeWidth="2" strokeLinecap="round" /></svg>Recorrido GPS</li>
        <li><svg width="34" height="12"><circle cx="9" cy="6" r="3.5" className="l-ant" /><circle cx="24" cy="6" r="5.5" className="l-ant" /></svg>Antena LBS · tamaño = tiempo de uso</li>
        <li><svg width="34" height="12"><line x1="2" y1="3.5" x2="32" y2="3.5" className="l-lbs" strokeWidth="1.6" /><line x1="2" y1="8.5" x2="32" y2="8.5" className="l-lbs" strokeWidth="1.6" /></svg>Recorrido estimado LBS</li>
        <li><svg width="34" height="12"><line x1="2" y1="6" x2="32" y2="6" className="l-lbs" strokeWidth="2" strokeDasharray="4 3" /></svg>Transición GNSS → LBS</li>
        <li><svg width="34" height="12"><line x1="2" y1="6" x2="32" y2="6" className="l-lbs" strokeWidth="2" /></svg>Transición LBS → GNSS</li>
        {suspicious && <li><svg width="34" height="12"><circle cx="17" cy="6" r="5" className="l-flag" /></svg>Antena sospechosa (&gt; 1,5 km)</li>}
      </ul>
      <p>Grosor de transición ∝ distancia. Pasa el mouse por una antena para ver su radio de 500 m.</p>
    </aside>
  )
}
