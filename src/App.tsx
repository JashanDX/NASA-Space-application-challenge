import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import CosmosBackground from './CosmosBackground'
import './App.css'

type Body = 'Mars' | 'Moon'
type Feature = {
  id: string
  name: string
  body: Body
  kind: string
  latitude: number
  longitude: number
  tags: string[]
  note: string
}
type NasaImage = {
  id: string
  title: string
  description: string
  creator: string
  date: string
  imageUrl: string
  detailsUrl: string
}
type ImageState = { query: string; status: 'loading' | 'ready' | 'error'; items: NasaImage[] }
type Message = { role: 'user' | 'assistant'; text: string }

const features: Feature[] = [
  { id: 'olympus', name: 'Olympus Mons', body: 'Mars', kind: 'Shield volcano', latitude: 18.65, longitude: 226.2, tags: ['volcanic', 'shield edifice', 'caldera'], note: 'A large shield-volcano edifice with summit caldera morphology. The tags describe broad form, not a sampled terrain profile.' },
  { id: 'valles', name: 'Valles Marineris', body: 'Mars', kind: 'Canyon system', latitude: -13.9, longitude: 300.8, tags: ['canyon', 'linear trough', 'tectonic'], note: 'A major canyon system. This catalog view does not resolve local wall slopes or elevation.' },
  { id: 'gale', name: 'Gale Crater', body: 'Mars', kind: 'Impact crater', latitude: -5.4, longitude: 137.8, tags: ['impact', 'crater', 'sedimentary deposit'], note: 'An impact crater investigated by the Curiosity rover. The broad class is not a substitute for local stratigraphic analysis.' },
  { id: 'jezero', name: 'Jezero Crater', body: 'Mars', kind: 'Impact crater', latitude: 18.4, longitude: 77.7, tags: ['impact', 'crater', 'delta deposit'], note: 'An impact crater selected as the Perseverance rover landing site. The comparison uses feature classes only.' },
  { id: 'hellas', name: 'Hellas Planitia', body: 'Mars', kind: 'Impact basin', latitude: -42.4, longitude: 70.5, tags: ['impact', 'basin', 'multi-ring structure'], note: 'A large impact-basin landform. No basin-scale elevation values are sampled in this interface.' },
  { id: 'marius', name: 'Marius Hills', body: 'Moon', kind: 'Volcanic complex', latitude: 14.1, longitude: 56.0, tags: ['volcanic', 'dome field', 'lava tube'], note: 'A lunar volcanic region with a field of domes. The analog is morphological and does not imply matching eruption conditions.' },
  { id: 'schroteri', name: "Vallis Schroteri", body: 'Moon', kind: 'Sinuous rille', latitude: 26.2, longitude: 309.0, tags: ['channel', 'linear trough', 'volcanic'], note: 'A sinuous lunar rille. Its shape can be compared with channels, but the mechanism must be assessed from source data.' },
  { id: 'tycho', name: 'Tycho Crater', body: 'Moon', kind: 'Impact crater', latitude: -43.3, longitude: 348.8, tags: ['impact', 'crater', 'ejecta'], note: 'A prominent lunar impact crater. This record supplies a broad feature class, not a crater-depth measurement.' },
  { id: 'copernicus', name: 'Copernicus Crater', body: 'Moon', kind: 'Impact crater', latitude: 9.6, longitude: 339.9, tags: ['impact', 'crater', 'ejecta'], note: 'A lunar impact crater. Comparison scores are calculated from shared catalog tags only.' },
  { id: 'spa', name: 'South Pole-Aitken Basin', body: 'Moon', kind: 'Impact basin', latitude: -53.0, longitude: 191.0, tags: ['impact', 'basin', 'multi-ring structure'], note: 'A major lunar impact-basin landform. No local topographic sample is loaded for this view.' },
]

const planetSources = {
  Mars: 'NASA Images API / USGS-IAU feature index',
  Moon: 'NASA Images API / USGS-IAU feature index',
}

function rankTwins(source: Feature) {
  return features
    .filter((feature) => feature.body !== source.body)
    .map((feature) => {
      const shared = source.tags.filter((tag) => feature.tags.includes(tag))
      const unique = new Set([...source.tags, ...feature.tags]).size
      return { feature, shared, score: unique ? Math.round((shared.length / unique) * 100) : 0 }
    })
    .sort((a, b) => b.score - a.score || a.feature.name.localeCompare(b.feature.name))
}

function useNasaImages(feature: Feature): ImageState {
  const [state, setState] = useState<ImageState>({ query: '', status: 'loading', items: [] })

  useEffect(() => {
    const controller = new AbortController()
    const query = `${feature.name} ${feature.body}`
    fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image&page_size=8`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('NASA Images API request failed')
        return response.json()
      })
      .then((payload: { collection?: { items?: Array<{ data?: Array<Record<string, unknown>>; links?: Array<Record<string, unknown>> }> } }) => {
        const items = (payload.collection?.items ?? []).flatMap((item) => {
          const record = item.data?.[0]
          const image = item.links?.find((link) => link.render === 'image' && typeof link.href === 'string')
          if (!record || typeof image?.href !== 'string' || typeof record.nasa_id !== 'string') return []
          const recordText = [record.title, record.description_508, record.description, ...(Array.isArray(record.keywords) ? record.keywords : [])]
            .filter((value): value is string => typeof value === 'string')
            .join(' ')
          if (!normalizeSearchText(recordText).includes(normalizeSearchText(feature.name))) return []
          return [{
            matchScore: normalizeSearchText(typeof record.title === 'string' ? record.title : '').includes(normalizeSearchText(feature.name)) ? 3 : normalizeSearchText(typeof record.description_508 === 'string' ? record.description_508 : typeof record.description === 'string' ? record.description : '').includes(normalizeSearchText(feature.name)) ? 2 : 1,
            id: record.nasa_id,
            title: typeof record.title === 'string' ? record.title : feature.name,
            description: typeof record.description_508 === 'string' ? record.description_508 : typeof record.description === 'string' ? record.description : 'NASA image record; no description supplied.',
            creator: typeof record.secondary_creator === 'string' ? record.secondary_creator : typeof record.center === 'string' ? record.center : 'NASA',
            date: typeof record.date_created === 'string' ? record.date_created.slice(0, 10) : 'Date not supplied',
            imageUrl: image.href,
            detailsUrl: `https://images.nasa.gov/details/${record.nasa_id}`,
          }]
        }).sort((a, b) => b.matchScore - a.matchScore).slice(0, 4)
        setState({ query, status: 'ready', items: items.map(({ matchScore: _matchScore, ...item }) => item) })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ query, status: 'error', items: [] })
      })

    return () => controller.abort()
  }, [feature])

  const query = `${feature.name} ${feature.body}`
  return state.query === query ? state : { query, status: 'loading', items: [] }
}

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function formatCoordinate(value: number, positive: string, negative: string) {
  return `~${Math.abs(value).toFixed(1)}° ${value >= 0 ? positive : negative}`
}

function App() {
  const [body, setBody] = useState<Body>('Mars')
  const [selectedId, setSelectedId] = useState('olympus')
  const [twinId, setTwinId] = useState('marius')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', text: 'Ask about the selected feature, its catalog-based twin, or the evidence available here. Answers use NASA image metadata and the displayed morphology tags; no language model or terrain raster is connected.' },
  ])

  const selected = features.find((feature) => feature.id === selectedId) ?? features[0]
  const planetFeatures = features.filter((feature) => feature.body === body)
  const rankedTwins = useMemo(() => rankTwins(selected), [selected])
  const selectedTwin = rankedTwins.find(({ feature }) => feature.id === twinId)?.feature ?? rankedTwins[0].feature
  const sharedTags = selected.tags.filter((tag) => selectedTwin.tags.includes(tag))
  const selectedImages = useNasaImages(selected)
  const twinImages = useNasaImages(selectedTwin)
  const selectedPrimaryImage = selectedImages.items[0]
  const twinPrimaryImage = twinImages.items[0]

  function chooseBody(nextBody: Body) {
    setBody(nextBody)
    const firstFeature = features.find((feature) => feature.body === nextBody)
    if (firstFeature) {
      setSelectedId(firstFeature.id)
      setTwinId(rankTwins(firstFeature)[0].feature.id)
    }
  }

  function chooseFeature(feature: Feature) {
    setBody(feature.body)
    setSelectedId(feature.id)
    setTwinId(rankTwins(feature)[0].feature.id)
  }

  function answerQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = question.trim()
    if (!prompt) return
    const normalized = prompt.toLowerCase()
    let response: string

    if (/elevation|height|slope|steep|dem|terrain value/.test(normalized)) {
      response = `No point-sampled elevation or slope is loaded for ${selected.name} or ${selectedTwin.name}. MOLA (Mars) and LOLA (Moon) are the cited elevation missions, but connecting a versioned DEM and sampling it at the feature coordinates is still required. I will not infer values from imagery.`
    } else if (/twin|similar|compare|match/.test(normalized)) {
      response = `${selected.name} and ${selectedTwin.name} share the catalog tags ${sharedTags.length ? sharedTags.join(', ') : 'none'}. The ranking is a Jaccard overlap of curated morphology tags, not a measured terrain-similarity score. It does not imply the same origin or composition.`
    } else if (/image|photo|mission|observ/.test(normalized) && selectedPrimaryImage) {
      response = `NASA's Images API returned “${selectedPrimaryImage.title}” (${selectedPrimaryImage.id}, ${selectedPrimaryImage.date}), credited to ${selectedPrimaryImage.creator}. Record description: ${selectedPrimaryImage.description}`
    } else {
      response = `${selected.name} is cataloged here as a ${selected.kind.toLowerCase()}. ${selected.note} The selected NASA image record${selectedPrimaryImage ? ` is “${selectedPrimaryImage.title}” (${selectedPrimaryImage.id})` : ' has not loaded yet'}. Numerical terrain measurements are not available in this build.`
    }

    setMessages((current) => [...current, { role: 'user', text: prompt }, { role: 'assistant', text: response }])
    setQuestion('')
  }

  return (
    <div className="app-shell">
      <CosmosBackground />
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Astra Atlas home">
          <span className="brand-mark" aria-hidden="true"><i /></span>
          <span>ASTRA<span className="wordmark-light"> / ATLAS</span></span>
        </a>
        <div className="topbar-center"><span className="status-dot" /> PLANETARY INTELLIGENCE <span className="topbar-divider">/</span> FIELD SYSTEM 01</div>
        <a className="source-link" href="https://images.nasa.gov/" target="_blank" rel="noreferrer">NASA IMAGE LIBRARY <span aria-hidden="true">↗</span></a>
      </header>

      <main id="top" className="workspace">
        <section className="intro-row">
          <div>
            <div className="eyebrow"><span>01</span> CROSS-WORLD MORPHOLOGY</div>
            <h1>Planetary <em>twin</em> finder</h1>
            <p className="intro-copy">Explore named terrain across Mars and the Moon. Find a morphology analog, inspect NASA imagery, and see exactly what the evidence can support.</p>
          </div>
          <div className="mission-stamp"><span>DATA MODE</span><strong>PUBLIC SOURCES</strong><small>NO API KEY REQUIRED</small></div>
        </section>

        <section className="explorer-grid" aria-label="Planetary explorer">
          <aside className="place-rail panel">
            <div className="rail-heading"><span>CELESTIAL BODY</span><span className="micro-index">A / 02</span></div>
            <div className="body-switch" role="group" aria-label="Select celestial body">
              {(['Mars', 'Moon'] as const).map((option) => <button key={option} type="button" className={`body-option ${body === option ? `active ${option.toLowerCase()}` : ''}`} onClick={() => chooseBody(option)} aria-pressed={body === option}><span className={`body-dot ${option.toLowerCase()}`} />{option}</button>)}
            </div>
            <div className="rail-heading landmark-heading"><span>LANDMARKS</span><span className="count">0{planetFeatures.length}</span></div>
            <div className="landmark-list">
              {planetFeatures.map((feature, index) => <button key={feature.id} type="button" className={`landmark-item ${selected.id === feature.id ? 'selected' : ''}`} onClick={() => chooseFeature(feature)}>
                <span className="landmark-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="landmark-label"><strong>{feature.name}</strong><small>{feature.kind}</small></span>
                <span className="landmark-arrow" aria-hidden="true">›</span>
              </button>)}
            </div>
            <div className="rail-foot"><span className="source-led" /> FEATURE NAMES / IAU GAZETTEER</div>
          </aside>

          <section className="map-panel panel" aria-label={`${body} coordinate map`}>
            <div className="map-topline"><div><span className="eyebrow">SURFACE INDEX</span><h2>{body} <span>·</span> named features</h2></div><div className="map-tools"><span className="live-tag"><i /> LIVE CATALOG</span><a className="text-tool trek-link" href={body === 'Mars' ? 'https://trek.nasa.gov/mars/' : 'https://trek.nasa.gov/moon/'} target="_blank" rel="noreferrer">NASA TREK ↗</a><button type="button" className="text-tool" title="Map projection is schematic">EQUIRECTANGULAR</button></div></div>
            <div className={`coordinate-map ${body.toLowerCase()}`}>
              <div className="map-grid-lines" aria-hidden="true">
                {Array.from({ length: 11 }, (_, i) => <span key={`v-${i}`} className="grid-line vertical" style={{ left: `${i * 10}%` }} />)}
                {Array.from({ length: 7 }, (_, i) => <span key={`h-${i}`} className="grid-line horizontal" style={{ top: `${i * 16.666}%` }} />)}
              </div>
              <div className="latitude-ticks" aria-hidden="true"><span>90°N</span><span>60°N</span><span>30°N</span><span>EQ</span><span>30°S</span><span>60°S</span><span>90°S</span></div>
              {planetFeatures.map((feature, index) => {
                const isSelected = feature.id === selected.id
                return <button key={feature.id} type="button" aria-label={`Select ${feature.name}`} aria-pressed={isSelected} className={`map-pin ${isSelected ? 'active' : ''}`} style={{ left: `${(feature.longitude / 360) * 100}%`, top: `${((90 - feature.latitude) / 180) * 100}%`, '--pin-index': index } as React.CSSProperties} onClick={() => chooseFeature(feature)}>
                  <span className="pin-core" /><span className="pin-label">{feature.name}</span>
                </button>
              })}
              <div className="map-coordinate" aria-hidden="true"><span>0°</span><span>90°E</span><span>180°</span><span>270°E</span><span>360°</span></div>
              <div className="map-cursor" aria-hidden="true"><span>LAT {selected.latitude.toFixed(1)} / LON {selected.longitude.toFixed(1)}</span></div>
            </div>
            <div className="map-caption"><span><b>●</b> {selected.name} selected</span><span>SCHEMATIC · APPROX. FEATURE CENTERS · NOT TERRAIN IMAGERY</span></div>
          </section>

          <aside className="profile-panel panel">
            <div className="profile-head"><div className="eyebrow">FEATURE PROFILE <span className="micro-index">B / 01</span></div><span className="orbit-icon" aria-hidden="true"><i /></span></div>
            <span className="feature-type">{selected.kind.toUpperCase()}</span>
            <h2>{selected.name}</h2>
            <p className="profile-note">{selected.note}</p>
            <div className="coordinate-readout">
              <div><span>LATITUDE</span><strong>{formatCoordinate(selected.latitude, 'N', 'S')}</strong></div>
              <div><span>LONGITUDE</span><strong>~{selected.longitude.toFixed(1)}° E</strong></div>
            </div>
            <div className="tag-block"><span className="section-label">MORPHOLOGY TAGS <i>CURATED</i></span><div className="tag-list">{selected.tags.map((tag) => <span className="morph-tag" key={tag}>{tag}</span>)}</div></div>
            <div className="terrain-availability"><span className="availability-mark">!</span><div><strong>Terrain raster not connected</strong><small>Elevation / slope are intentionally not estimated.</small></div></div>
            <a className="gazetteer-link" href="https://planetarynames.wr.usgs.gov/" target="_blank" rel="noreferrer">OPEN USGS / IAU GAZETTEER <span aria-hidden="true">↗</span></a>
          </aside>
        </section>

        <section className="analysis-grid" aria-label="Twin analysis and scientific assistant">
          <section className="twin-section panel">
            <div className="section-heading"><div><div className="eyebrow"><span>02</span> PLANETARY TWIN FINDER</div><h2>Closest morphology analogs</h2></div><div className="score-key"><i /> TAG OVERLAP / NOT TERRAIN SIMILARITY</div></div>
            <div className="twin-content">
              <div className="rank-list" role="list" aria-label="Ranked cross-world matches">
                {rankedTwins.slice(0, 4).map(({ feature, shared, score }, index) => <button key={feature.id} type="button" className={`rank-row ${feature.id === selectedTwin.id ? 'chosen' : ''}`} onClick={() => setTwinId(feature.id)} aria-pressed={feature.id === selectedTwin.id}>
                  <span className="rank-number">0{index + 1}</span><span className={`rank-planet ${feature.body.toLowerCase()}`} />
                  <span className="rank-name"><strong>{feature.name}</strong><small>{feature.body} / {feature.kind}</small></span>
                  <span className="overlap-meter"><i style={{ width: `${score}%` }} /></span><span className="overlap-value">{score}<small>%</small></span>
                  <span className="rank-shared">{shared.length ? `${shared.length} shared` : 'no shared tags'}</span>
                </button>)}
              </div>
              <div className="comparison-card">
                <div className="comparison-title"><span>SELECTED PAIR</span><span className="pair-status"><i /> EXPLAINABLE MATCH</span></div>
                <div className="pair-visuals">
                  <ImageTile feature={selected} image={selectedPrimaryImage} state={selectedImages.status} />
                  <div className="pair-connector"><span>VS</span><i /></div>
                  <ImageTile feature={selectedTwin} image={twinPrimaryImage} state={twinImages.status} />
                </div>
                <div className="pair-summary"><h3>{selected.name}<span> / </span>{selectedTwin.name}</h3><p>{sharedTags.length ? `Shared catalog morphology: ${sharedTags.join(', ')}.` : 'No catalog morphology tags overlap.'} This is a candidate for scientific comparison, not evidence of shared origin, composition, scale, or terrain conditions.</p></div>
                <div className="evidence-footer"><span>DERIVED: JACCARD OVERLAP OF TAGS</span><span>SOURCE: {planetSources[selected.body]} + {planetSources[selectedTwin.body]}</span></div>
              </div>
            </div>
          </section>

          <section className="assistant-panel panel">
            <div className="assistant-heading"><div><div className="eyebrow"><span>03</span> EVIDENCE DESK</div><h2>Field assistant</h2></div><span className="assistant-badge">RETRIEVAL MODE</span></div>
            <div className="message-list" aria-live="polite">
              {messages.slice(-5).map((message, index) => <div key={`${message.role}-${index}-${message.text.slice(0, 14)}`} className={`message ${message.role}`}><span className="message-role">{message.role === 'assistant' ? 'ATLAS / SOURCE-BOUND' : 'YOU'}</span><p>{message.text}</p></div>)}
            </div>
            <form className="assistant-form" onSubmit={answerQuestion}>
              <label className="sr-only" htmlFor="assistant-question">Ask about the selected landmark</label>
              <input id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this location or its twin..." />
              <button type="submit" aria-label="Send question" title="Send question">SEND <span aria-hidden="true">→</span></button>
            </form>
            <div className="assistant-foot">RESPONSES USE VISIBLE RECORDS · NO EXTERNAL LLM CONFIGURED</div>
          </section>
        </section>

        <footer className="data-footer">
          <div><span className="footer-mark" /> ASTRA / ATLAS <span className="footer-divider">·</span> SCIENCE WITH PROVENANCE</div>
          <div className="footer-sources"><a href="https://images.nasa.gov/" target="_blank" rel="noreferrer">NASA IMAGES API</a><a href="https://pds.nasa.gov/" target="_blank" rel="noreferrer">PLANETARY DATA SYSTEM</a><a href="https://planetarynames.wr.usgs.gov/" target="_blank" rel="noreferrer">USGS / IAU GAZETTEER</a></div>
          <span className="footer-disclaimer">NO DEM SAMPLING IN THIS BUILD</span>
        </footer>
      </main>
    </div>
  )
}

function ImageTile({ feature, image, state }: { feature: Feature; image?: NasaImage; state: ImageState['status'] }) {
  return <div className={`image-tile ${feature.body.toLowerCase()}`}>
    {image ? <img src={image.imageUrl} alt={image.title} loading="lazy" /> : <div className="image-placeholder"><span>{state === 'loading' ? 'RETRIEVING NASA RECORD' : state === 'error' ? 'NASA IMAGE SERVICE UNAVAILABLE' : 'NO MATCHING IMAGE RECORD'}</span><i /></div>}
    <div className="image-overlay"><span>{image ? `NASA SEARCH MATCH / ${image.id}` : `${feature.body.toUpperCase()} / ${feature.kind.toUpperCase()}`}</span><strong>{image?.title ?? feature.name}</strong></div>
    {image && <a className="image-credit" href={image.detailsUrl} target="_blank" rel="noreferrer" title={`${image.title} / ${image.creator}`}>NASA · {image.id} ↗</a>}
  </div>
}

export default App
