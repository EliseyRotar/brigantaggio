import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, User, BookOpen, Maximize2, Minimize2, Music, Volume2, VolumeX, Disc, Info, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet icons natively
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Reusable standalone Map component to avoid single-instance context issues
const SlideMap: React.FC<{
  center: [number, number];
  zoom: number;
  markers: Array<{ lat: number; lng: number; title: string; desc: string }>;
  circles?: Array<{ center: [number, number]; radius: number; color: string }>;
  height?: string;
  onExpand?: () => void;
}> = ({ center, zoom, markers, circles, height = "h-[220px] lg:h-[320px]", onExpand }) => {
  const mapRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = L.map(mapRef.current).setView(center, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    markers.forEach(m => {
      const marker = L.marker([m.lat, m.lng]).addTo(map);
      marker.bindPopup(`<b>${m.title}</b><br><span style="font-size:smaller">${m.desc}</span>`);
    });

    circles?.forEach(c => {
      L.circle(c.center, { radius: c.radius, color: c.color, fillOpacity: 0.15 }).addTo(map);
    });

    const timer = setTimeout(() => { map.invalidateSize(); }, 400);

    return () => { clearTimeout(timer); map.remove(); };
  }, [center, zoom, markers, circles]);

  return (
    <div className={`relative w-full ${height} rounded-2xl overflow-hidden shadow-lg border border-amber-900/20 z-10`}>
      <div ref={mapRef} className="w-full h-full" />
      {onExpand && (
        <button
          onClick={onExpand}
          className="absolute top-2 right-2 z-[600] bg-white/90 hover:bg-white p-1.5 rounded-lg shadow border border-stone-200 text-stone-600 hover:text-amber-900 transition"
          title="Espandi la mappa"
        >
          <Maximize2 size={12} />
        </button>
      )}
    </div>
  );
};

const LightboxMap: React.FC<{
  center: [number, number];
  zoom: number;
  markers: Array<{ lat: number; lng: number; title: string; desc: string }>;
  circles?: Array<{ center: [number, number]; radius: number; color: string }>;
}> = ({ center, zoom, markers, circles }) => {
  const mapRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = L.map(mapRef.current).setView(center, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    markers.forEach(m => {
      const marker = L.marker([m.lat, m.lng]).addTo(map);
      marker.bindPopup(`<b>${m.title}</b><br><span style="font-size:smaller">${m.desc}</span>`);
    });

    circles?.forEach(c => {
      L.circle(c.center, { radius: c.radius, color: c.color, fillOpacity: 0.15 }).addTo(map);
    });

    const timer = setTimeout(() => { map.invalidateSize(); }, 300);
    return () => { clearTimeout(timer); map.remove(); };
  }, []);

  return <div ref={mapRef} className="w-full h-full" />;
};

interface Slide {
  id: number;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
  speaker: string;
  color: string;
  notes: string;
}

const speakers: Record<string, { color: string; short: string }> = {
  'Erik Zorza': { color: '#8B4513', short: 'ERIK' },
  'Lapomarda Davide': { color: '#2F4F4F', short: 'DAVIDE' },
  'Elisey Rotar': { color: '#4A3728', short: 'ELISEY' },
  'Mabrouk Ouertani': { color: '#6B4423', short: 'MABROUK' },
  'Tutti': { color: '#3F2A1D', short: 'TUTTI' },
};

const App: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Audio setup
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const [audioMode, setAudioMode] = useState<'verdi' | 'synth'>('verdi');
  const [showMusicInfo, setShowMusicInfo] = useState(false);

  type LightboxData =
    | { kind: 'image'; src: string; title: string; caption: string; info: string }
    | { kind: 'map'; title: string; caption: string; info: string; center: [number, number]; zoom: number; markers: Array<{lat: number; lng: number; title: string; desc: string}>; circles?: Array<{center: [number, number]; radius: number; color: string}> };
  const [lightbox, setLightbox] = useState<LightboxData | null>(null);
  
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const oscRef = React.useRef<OscillatorNode | null>(null);
  const gainRef = React.useRef<GainNode | null>(null);

  // Sync volume state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = musicVolume;
    }
    if (gainRef.current && audioCtxRef.current) {
      gainRef.current.gain.setValueAtTime(musicVolume * 0.04, audioCtxRef.current.currentTime);
    }
  }, [musicVolume]);

  // Manage Background Audio
  useEffect(() => {
    if (musicEnabled) {
      if (audioMode === 'verdi') {
        // Stop Web Audio synth if playing
        if (oscRef.current) {
          try { oscRef.current.stop(); } catch(e){}
          oscRef.current = null;
        }
        // Play HTML Audio
        if (audioRef.current) {
          audioRef.current.volume = musicVolume;
          audioRef.current.play().catch(err => {
            console.warn("Autoplay per la traccia bloccato dal browser, avvio sintesi d'atmosfera", err);
            setAudioMode('synth');
          });
        }
      } else {
        // Pause HTML Audio
        if (audioRef.current) {
          audioRef.current.pause();
        }
        // Start atmospheric drone
        if (!audioCtxRef.current) {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        if (!oscRef.current) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          // D2 Deep Cello / Cinematic Drone
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(73.42, ctx.currentTime);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(250, ctx.currentTime);

          gain.gain.setValueAtTime(musicVolume * 0.04, ctx.currentTime);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start();
          oscRef.current = osc;
          gainRef.current = gain;

          // LFO for tension modulation
          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          lfo.frequency.setValueAtTime(0.12, ctx.currentTime);
          lfoGain.gain.setValueAtTime(1.5, ctx.currentTime);
          lfo.connect(lfoGain);
          lfoGain.connect(osc.frequency);
          lfo.start();
        }
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (oscRef.current) {
        try { oscRef.current.stop(); } catch(e){}
        oscRef.current = null;
      }
    }
  }, [musicEnabled, audioMode]);

  // Touch handlers for mobile navigation swipe
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > 40) { // Minimum swipe length
      if (diff > 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    setTouchStartX(null);
  };

  // Static final Map Ref
  const finalMapRef = React.useRef<HTMLDivElement>(null);
  const finalLeafletMap = React.useRef<L.Map | null>(null);

  const initFinalMap = useCallback(() => {
    if (!finalMapRef.current || finalLeafletMap.current) return;
    try {
      const map = L.map(finalMapRef.current).setView([40.8, 15.5], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);

      const markers = [
        { lat: 40.9, lng: 15.5, title: 'Carmine Crocco - Basilicata', desc: 'Zona principale di attività 1861-1864' },
        { lat: 41.05, lng: 14.85, title: 'Ninco Nanco - Irpinia', desc: 'Operazioni di guerriglia' },
        { lat: 41.25, lng: 14.75, title: 'Pontelandolfo & Casalduni', desc: 'Massacro del 14 agosto 1861' },
        { lat: 39.8, lng: 16.2, title: 'José Borjes - Calabria', desc: 'Tentativo organizzazione militare 1861' },
        { lat: 41.9, lng: 13.5, title: 'Chiavone - Abruzzo/Lazio', desc: 'Bande settentrionali' },
        { lat: 40.95, lng: 15.65, title: 'Rionero in Vulture', desc: 'Città natale di Carmine Crocco' },
      ];

      markers.forEach(m => {
        const marker = L.marker([m.lat, m.lng]).addTo(map);
        marker.bindPopup(`<b>${m.title}</b><br><span style="font-size:smaller">${m.desc}</span>`);
      });

      L.circle([40.9, 15.5], { radius: 50000, color: '#8B4513', fillOpacity: 0.1 }).addTo(map);
      L.circle([41.25, 14.75], { radius: 20000, color: '#b91c1c', fillOpacity: 0.15 }).addTo(map);

      finalLeafletMap.current = map;
    } catch (e) {
      console.error("Map init error:", e);
    }
  }, []);

  const slides: Slide[] = [
    {
      id: 0,
      title: "IL BRIGANTAGGIO POST-UNITARIO",
      subtitle: "1861-1870 • Una guerra civile dimenticata",
      content: (
        <div className="text-center space-y-6 lg:space-y-8">
          <div className="text-amber-800 text-lg lg:text-2xl font-serif tracking-[3px] lg:tracking-[4px]">
            REGNO D'ITALIA • MEZZOGIORNO
          </div>
          <div className="max-w-3xl mx-auto text-base lg:text-xl leading-relaxed text-stone-700">
            Una presentazione storica sul fenomeno più complesso e controverso della storia dell'Italia contemporanea, analizzato attraverso le sue cause agrarie, l'esplosione della guerriglia e la dura risposta militare.
            <p className="mt-2 text-base lg:text-lg text-stone-600">Il periodo 1861‑1870 vide oltre 20 000 vittime e trasformò il Mezzogiorno in un teatro di guerra civile non dichiarata.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:gap-4 max-w-xl mx-auto text-base lg:text-lg">
            <div className="p-3 lg:p-4 bg-amber-900/10 rounded-xl font-medium">Oltre 20.000 vittime stimate</div>
            <div className="p-3 lg:p-4 bg-amber-900/10 rounded-xl font-medium">Un decennio di guerriglia rurale</div>
          </div>
          <div className="flex flex-wrap justify-center gap-4 lg:gap-8 text-xs lg:text-sm pt-4 lg:pt-8">
            {Object.entries(speakers).filter(([k]) => k !== 'Tutti').map(([name, val]) => (
              <div key={name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 lg:w-3 lg:h-3 rounded-full" style={{backgroundColor: val.color}} />
                <span className="font-semibold text-stone-800">{name}</span>
              </div>
            ))}
          </div>
        </div>
      ),
      speaker: "Tutti",
      color: "#3F2A1D",
      notes: "Additional historical context added.APERTURA: Benvenuti. Oggi presenteremo il brigantaggio post-unitario, un tema fondamentale per capire le divisioni storiche italiane. Durata totale: 30 minuti.",
    },
    {
      id: 1,
      title: "I RELATORI",
      subtitle: "Struttura della lezione e divisione dei ruoli",
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 max-w-4xl mx-auto">
          {[
            { name: "Erik Zorza", role: "Contesto e nascita del fenomeno", time: "10 min", points: "1-5", desc: "La situazione del Sud pre-unitario e le cause profonde scatenanti." },
            { name: "Lapomarda Davide", role: "Personaggi e sviluppo guerriglia", time: "8-10 min", points: "6-10", desc: "Le tattiche militari, i grandi capi come Crocco, Ninco Nanco e il generale Borjes." },
            { name: "Elisey Rotar", role: "Repressione dello Stato italiano", time: "10 min", points: "11-14", desc: "L'intervento dei 100.000 soldati, la Legge Pica e la guerra contro i civili." },
            { name: "Mabrouk Ouertani", role: "Declino e interpretazioni storiche", time: "10 min", points: "15-21", desc: "La fine del fenomeno, i legami con la criminalità e la nascita della Questione Meridionale." },
          ].map((p, i) => (
            <div key={i} className="bg-amber-900/5 border border-amber-800/20 p-4 lg:p-6 rounded-xl flex flex-col justify-between">
              <div>
                <div className="font-bold text-lg lg:text-xl text-amber-900">{p.name}</div>
                <div className="text-stone-700 font-medium mt-1 text-sm lg:text-base">{p.role}</div>
                <p className="text-xs lg:text-sm text-stone-500 mt-2 leading-relaxed">{p.desc}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-amber-900/10 flex justify-between text-xs lg:text-sm text-amber-900 font-semibold">
                <span>Punti {p.points}</span>
                <span className="font-mono bg-amber-100 px-2 py-0.5 rounded">{p.time}</span>
              </div>
            </div>
          ))}
        </div>
      ),
      speaker: "Tutti",
      color: "#3F2A1D",
      notes: "Additional historical context added.Presentate voi stessi brevemente alla classe. Spiegate la divisione del lavoro e che ognuno ha curato in dettaglio la sua sezione."
    },
    // === ERIK ZORZA: Slides 2-5 ===
    {
      id: 2,
      title: "1. INTRODUZIONE GENERALE",
      subtitle: "Un fenomeno ibrido e complesso",
      content: (
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-10 items-start">
          <div className="flex-1 space-y-4 lg:space-y-5">
            <p className="text-base lg:text-lg leading-relaxed text-stone-800">
              Dopo la proclamazione del Regno d'Italia (17 marzo 1861), lo Stato unitario si trovò a dover gestire una crisi interna di dimensioni inaspettate. Il Mezzogiorno divenne il teatro di una guerra civile non dichiarata.
            </p>
            <div className="grid grid-cols-1 gap-2.5 text-sm lg:text-base">
              <div className="p-3 lg:p-4 border-l-4 border-amber-800 bg-amber-900/5 rounded-r-xl">
                <strong className="text-amber-900">Ribellione sociale:</strong> masse contadine esasperate da miseria e promesse non mantenute.
              </div>
              <div className="p-3 lg:p-4 border-l-4 border-amber-800 bg-amber-900/5 rounded-r-xl">
                <strong className="text-amber-900">Resistenza politica:</strong> reazione armata contro l'imposizione di un nuovo ordine statale.
              </div>
              <div className="p-3 lg:p-4 border-l-4 border-amber-800 bg-amber-900/5 rounded-r-xl">
                <strong className="text-amber-900">Lealismo borbonico:</strong> difesa dell'identità e dei simboli del disciolto Regno delle Due Sicilie.
              </div>
            </div>
            <div className="text-xs lg:text-sm text-stone-600 italic border-t border-amber-900/10 pt-2">
              Regioni maggiormente coinvolte: Basilicata, Campania, Calabria, Puglia, Abruzzo e Molise.
            </div>
          </div>
          <div className="w-full lg:w-80 shrink-0">
            <SlideMap
              center={[40.5, 15.5]}
              zoom={6}
              markers={[
                { lat: 40.85, lng: 14.25, title: 'Napoli', desc: 'Ex capitale borbonica' },
                { lat: 40.63, lng: 15.80, title: 'Basilicata', desc: 'Cuore della ribellione contadina' },
                { lat: 39.30, lng: 16.25, title: 'Calabria', desc: 'Aspromonte e sbarchi legittimisti' }
              ]}
              onExpand={() => setLightbox({ kind: 'map', title: 'Il Mezzogiorno continentale', caption: 'Teatro principale del brigantaggio post-unitario', info: `Basilicata, Campania, Calabria, Puglia, Abruzzo e Molise erano province con altissima concentrazione di latifondo e miseria contadina. La morfologia montuosa — Appennino lucano, Matese, Aspromonte — fornì ripari naturali impenetrabili per le bande. Napoli, ex capitale borbonica, rimase un centro di cospirazione legittimista per oltre un decennio dopo il 1861.`, center: [40.5, 15.5], zoom: 6, markers: [{ lat: 40.85, lng: 14.25, title: 'Napoli', desc: 'Ex capitale borbonica' }, { lat: 40.63, lng: 15.80, title: 'Basilicata', desc: 'Cuore della ribellione contadina' }, { lat: 39.30, lng: 16.25, title: 'Calabria', desc: 'Aspromonte e sbarchi legittimisti' }] })}
            />
            <div className="text-xs text-center mt-2 text-stone-500 italic">Mappa del Mezzogiorno continentale</div>
          </div>
        </div>
      ),
      speaker: "Erik Zorza",
      color: "#8B4513",
      notes: "Additional historical context added.Erik: Spiega che il brigantaggio non fu solo criminalità comune. Fu una sovrapposizione di ribellione sociale, patriottismo napoletano e reazione alle nuove tasse."
    },
    {
      id: 3,
      title: "2. IL SUD PRIMA DELL'UNITÀ",
      subtitle: "Il Regno delle Due Sicilie (1816-1861)",
      content: (
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          <div className="flex-1 space-y-4 lg:space-y-5 text-base lg:text-lg">
            <p>
              Il Regno delle Due Sicilie presentava forti contrasti strutturali: eccellenze urbane si contrapponevano a un'arretratezza rurale cronica.
            </p>
            <ul className="space-y-3 pl-5 list-disc marker:text-amber-800 text-stone-800">
              <li><strong>La Capitale:</strong> Napoli era una delle metropoli più grandi e culturalmente vivaci d'Europa.</li>
              <li><strong>Il Latifondo:</strong> Le campagne erano dominate da immense proprietà terriere nobiliari, scarsamente produttive.</li>
              <li><strong>Analfabetismo:</strong> Nelle aree rurali interne, il tasso di analfabetismo superava il 90%.</li>
              <li><strong>I Gabelloti:</strong> Intermediari spietati che gestivano le terre per conto dei baroni assenti, vessando i contadini.</li>
            </ul>
            <div className="mt-4 bg-[#f5e8c7] p-4 lg:p-5 rounded-2xl text-xs lg:text-sm text-stone-800 border border-amber-900/15">
              <strong>L'equilibrio borbonico:</strong> Pur paternalistico e autoritario, il regime borbonico manteneva una stabilità basata su una bassa pressione fiscale e sulla mediazione capillare della Chiesa locale.
            </div>
          </div>
          <div className="w-full lg:w-72 shrink-0">
            <div className="relative group cursor-pointer" onClick={() => setLightbox({ kind: 'image', src: `${import.meta.env.BASE_URL}images/regno-due-sicilie.jpg`, title: 'Il Regno delle Due Sicilie', caption: "Carta geografica d'epoca (1816–1861)", info: `Il Regno delle Due Sicilie (1816–1861) era il più esteso degli stati preunitari, con circa 9 milioni di abitanti e Napoli come quarta città d'Europa. Il regime borbonico garantiva bassa pressione fiscale e mediazione della Chiesa locale. La conquista garibaldina del 1860 sgretolò in pochi mesi un equilibrio secolare, seminando le premesse della rivolta contadina.` })}>
              <img src={`${import.meta.env.BASE_URL}images/regno-due-sicilie.jpg`} alt="Regno delle Due Sicilie" className="w-full h-48 lg:h-64 object-cover rounded-2xl shadow-md border border-amber-900/20 transition group-hover:brightness-90" />
              <div className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-lg shadow border border-stone-200 text-stone-600 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                <Maximize2 size={12} />
              </div>
            </div>
            <div className="text-xs text-center mt-2 text-stone-500 italic">Mappa d'epoca del Regno delle Due Sicilie</div>
          </div>
        </div>
      ),
      speaker: "Erik Zorza",
      color: "#8B4513",
      notes: "Additional historical context added.Erik: Soffermati sul ruolo dei 'gabelloti' e sul latifondo. I contadini vivevano al limite della sussistenza e vedevano la terra come unica fonte di vita."
    },
    {
      id: 4,
      title: "3. LE CAUSE PROFONDE",
      subtitle: "I fattori scatenanti della ribellione",
      content: (
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 text-sm lg:text-base">
          {[
            { title: "La Delusione Agraria", text: "I contadini avevano appoggiato l'impresa garibaldina sperando nella divisione delle terre demaniali. Il nuovo Stato, per non perdere l'appoggio dei baroni, lasciò intatto il latifondo." },
            { title: "💰 Pressione Fiscale Insostenibile", text: "L'introduzione di nuove imposte, in particolare l'odiatissima Tassa sul Macinato (sul grano), colpì direttamente la dieta di base delle classi più povere, portandole alla fame." },
            { title: "⚔️ La Leva Militare Obbligatoria", text: "Il servizio militare obbligatorio (3-5 anni) strappava i giovani alle famiglie, privandole di braccia indispensabili per il lavoro nei campi. Migliaia scelsero la macchia." },
            { title: "🏚️ Il Vuoto Amministrativo", text: "Il collasso delle vecchie magistrature borboniche e l'arrivo di funzionari piemontesi che non conoscevano il territorio crearono un vuoto di potere immediato." },
          ].map((c, i) => (
            <div key={i} className="border border-amber-900/15 p-5 rounded-xl bg-white/70 shadow-sm flex flex-col justify-between">
              <div>
                <div className="font-bold text-base lg:text-lg mb-2 text-amber-900 flex items-center gap-2">
                  {c.title}
                </div>
                <p className="text-stone-700 leading-relaxed">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      ),
      speaker: "Erik Zorza",
      color: "#8B4513",
      notes: "Additional historical context added.Erik: Spiega che la leva militare fu la scintilla finale: un giovane contadino che partiva per 5 anni significava la rovina economica per la sua famiglia."
    },
    {
      id: 5,
      title: "4-5. NASCITA E STRUTTURA DELLE BANDE",
      subtitle: "L'organizzazione della guerriglia",
      content: (
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          <div className="flex-1 space-y-4 lg:space-y-5">
            <div>
              <h4 className="font-semibold text-base lg:text-lg text-amber-900 mb-2.5">Composizione delle formazioni:</h4>
              <div className="flex flex-wrap gap-2">
                {["Ex soldati dell'esercito borbonico", "Contadini e braccianti senza terra", "Renitenti alla leva piemontese", "Evasi e criminali comuni", "Ufficiali legittimisti stranieri"].map(t => (
                  <div key={t} className="px-3.5 py-1.5 bg-amber-900/10 border border-amber-800/30 rounded-full text-xs lg:text-sm font-medium text-stone-800">
                    {t}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-stone-900 text-amber-50 rounded-xl">
                <strong className="text-amber-400 text-sm lg:text-base">Tattica militare:</strong>
                <p className="text-xs lg:text-sm mt-1 text-stone-300">
                  Guerriglia pura basata su imboscate fulminee, ritirate strategiche e dispersione nei boschi.
                </p>
              </div>
              <div className="p-4 border border-amber-900/20 bg-white/50 rounded-xl">
                <strong className="text-amber-900 text-sm lg:text-base">Rete logistica:</strong>
                <p className="text-xs lg:text-sm mt-1 text-stone-700">
                  Supporto vitale di manutengoli (fiancheggiatori) che fornivano viveri, polvere da sparo e informazioni.
                </p>
              </div>
            </div>

            <p className="text-xs lg:text-sm text-stone-600 italic">
              Il territorio impervio del Mezzogiorno offriva ripari naturali inespugnabili per gli eserciti regolari.
            </p>
          </div>
          <div className="w-full lg:w-72 shrink-0">
            <SlideMap
              center={[41.1, 15.1]}
              zoom={8}
              markers={[
                { lat: 40.95, lng: 15.63, title: 'Il Vulture', desc: 'Rifugio boscoso delle bande lucane' },
                { lat: 41.38, lng: 14.42, title: 'Monti del Matese', desc: 'Nascondiglio tra Campania e Molise' }
              ]}
              circles={[
                { center: [40.95, 15.63], radius: 25000, color: '#8B4513' }
              ]}
              onExpand={() => setLightbox({ kind: 'map', title: 'Le roccaforti montuose', caption: 'Basi operative delle bande brigantesche', info: `Il Monte Vulture (1.326 m, Basilicata) era la roccaforte di Crocco, con la foresta di Monticchio come nascondiglio principale. I Monti del Matese (fino a 2.050 m, al confine tra Campania e Molise) ospitavano le bande di Ninco Nanco e dei Fratelli La Gala. La conoscenza dei sentieri e la fitta vegetazione rendevano questi rifugi quasi inespugnabili per i reparti regolari dell'esercito.`, center: [41.1, 15.1], zoom: 8, markers: [{ lat: 40.95, lng: 15.63, title: 'Il Vulture', desc: 'Rifugio boscoso delle bande lucane' }, { lat: 41.38, lng: 14.42, title: 'Monti del Matese', desc: 'Nascondiglio tra Campania e Molise' }], circles: [{ center: [40.95, 15.63] as [number, number], radius: 25000, color: '#8B4513' }] })}
            />
            <div className="text-xs text-center mt-2 text-stone-500 italic">Le roccaforti montuose delle bande</div>
          </div>
        </div>
      ),
      speaker: "Erik Zorza",
      color: "#8B4513",
      notes: "Additional historical context added.Erik: Concludi la tua parte descrivendo come le bande sfruttassero la morfologia del territorio. Passa poi la parola a Davide per i personaggi."
    },
    // === DAVIDE: Slides 6-10 ===
    {
      id: 6,
      title: "6. RAPPORTO CON LA POPOLAZIONE",
      subtitle: "Tra omertà, sostegno e terrore",
      content: (
        <div className="max-w-4xl mx-auto space-y-6 lg:space-y-8">
          <p className="text-base lg:text-lg text-stone-800 text-center">
            Agli occhi delle masse rurali, i briganti assumevano spesso contorni mitici, venendo percepiti come:
          </p>
          <div className="flex justify-center gap-3 lg:gap-4 flex-wrap">
            {["Vendicatori dei torti subiti", "Difensori della fese cattolica", "Ribelli contro il 'Piemontese'"].map(t => (
              <div key={t} className="px-5 py-2.5 bg-stone-900 text-white rounded-full text-xs lg:text-sm font-medium shadow">
                {t}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 text-sm lg:text-base pt-2">
            <div className="bg-green-50 border border-green-800/20 p-5 rounded-xl">
              <strong className="text-green-900 flex items-center gap-1.5">
                <span className="text-lg">🤝</span> Complicità e Protezione
              </strong>
              <p className="text-stone-700 mt-2 text-xs lg:text-sm leading-relaxed">
                I contadini condividevano l'odio verso i proprietari terrieri e le autorità, offrendo rifugio spontaneo e depistando le colonne militari.
              </p>
            </div>
            <div className="bg-red-50 border border-red-800/20 p-5 rounded-xl">
              <strong className="text-red-900 flex items-center gap-1.5">
                <span className="text-lg">⚠️</span> Paura e Ritorsioni
              </strong>
              <p className="text-stone-700 mt-2 text-xs lg:text-sm leading-relaxed">
                Le bande esigevano il supporto con la forza: chi veniva sospettato di fare la spia per la Guardia Nazionale subiva vendette spietate.
              </p>
            </div>
          </div>
        </div>
      ),
      speaker: "Lapomarda Davide",
      color: "#2F4F4F",
      notes: "Additional historical context added.Davide: Inizia la tua parte. Spiega la doppia natura del rapporto: i briganti erano eroi popolari ma applicavano anche una ferrea legge del terrore verso i delatori."
    },
    {
      id: 7,
      title: "7. LE PRIME GRANDI BANDE",
      subtitle: "L'esplosione della guerra nel Mezzogiorno",
      content: (
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 items-center">
          <div className="flex-1 space-y-4 lg:space-y-5">
            <p className="text-base lg:text-lg text-stone-800">
              Tra il 1861 e il 1863, intere province sfuggirono al controllo del neonato Stato italiano. Le bande si unirono formando vere e proprie armate.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs lg:text-sm">
              <div className="p-4 border-l-4 border-amber-800 bg-white/60 rounded-r-lg">
                <strong>Occupazione di paesi:</strong> I briganti entravano nei borghi, bruciavano gli archivi comunali (per distruggere i registri delle tasse e di leva) e ripristinavano i ritratti di Francesco II.
              </div>
              <div className="p-4 border-l-4 border-amber-800 bg-white/60 rounded-r-lg">
                <strong>Scontri in campo aperto:</strong> In alcune occasioni le bande lucane e campane riuscirono a sconfiggere distaccamenti regolari dell'esercito.
              </div>
            </div>
            <p className="text-xs lg:text-sm text-stone-600">
              La borghesia agraria si rifugiò nei capoluoghi protetti, lasciando le campagne in mano agli insorti.
            </p>
          </div>
          <div className="w-full lg:w-72 shrink-0">
            <div className="relative group cursor-pointer" onClick={() => setLightbox({ kind: 'image', src: `${import.meta.env.BASE_URL}images/briganti-banda.jpg`, title: 'Una banda brigantesca', caption: 'Formazione armata nei boschi del Mezzogiorno', info: `Le bande brigantesche erano formazioni mobili di 20–200 uomini, composte da ex soldati borbonici, contadini senza terra, renitenti alla leva e fuorilegge. Operavano attraverso imboscate fulminee e ritirate nei boschi impenetrabili, sfruttando la conoscenza capillare del territorio. Il governo italiano usò fotografie come questa come prova della 'natura criminale' del fenomeno, oscurando deliberatamente le motivazioni politiche e sociali della rivolta.` })}>
              <img src={`${import.meta.env.BASE_URL}images/briganti-banda.jpg`} alt="Banda armata" className="w-full h-48 lg:h-60 object-cover rounded-2xl shadow-md border border-amber-900/20 transition group-hover:brightness-90" />
              <div className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-lg shadow border border-stone-200 text-stone-600 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                <Maximize2 size={12} />
              </div>
            </div>
            <div className="text-xs text-center mt-2 text-stone-500 italic">Formazione brigantesca nei boschi</div>
          </div>
        </div>
      ),
      speaker: "Lapomarda Davide",
      color: "#2F4F4F",
      notes: "Additional historical context added.Davide: Sottolinea l'atto simbolico di bruciare gli archivi comunali: significava azzerare i debiti, le tasse e le liste di leva."
    },
    {
      id: 8,
      title: "8. CARMINE CROCCO",
      subtitle: "Il 'Generale dei Briganti' (1830-1905)",
      content: (
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          <div className="w-full lg:w-72 shrink-0">
            <div className="relative group cursor-pointer" onClick={() => setLightbox({ kind: 'image', src: `${import.meta.env.BASE_URL}images/carmine-crocco.jpg`, title: 'Carmine Crocco', caption: 'Rionero in Vulture, 1830 – Portoferraio, 1905', info: `Ex bracciante e soldato borbonico, Carmine Donatello Crocco fu il più potente e carismatico capobanda del brigantaggio: comandò fino a 2.000 uomini nella foresta di Monticchio, sull'Appennino lucano. Tradito nel 1864 dal suo luogotenente Caruso, scampò alla fucilazione grazie a un'amnistia. In carcere dettò le sue celebri Memorie — documento fondamentale per comprendere il brigantaggio dal punto di vista dei vinti.` })}>
              <img src={`${import.meta.env.BASE_URL}images/carmine-crocco.jpg`} alt="Carmine Crocco" className="w-full h-56 lg:h-64 object-cover rounded-2xl shadow-md border border-amber-900/20 transition group-hover:brightness-90" />
              <div className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-lg shadow border border-stone-200 text-stone-600 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                <Maximize2 size={12} />
              </div>
            </div>
            <div className="text-xs text-center mt-2 text-stone-500 italic">Carmine Crocco, capobanda della Basilicata</div>
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <div className="text-xs font-semibold text-amber-800 uppercase tracking-widest">Il Personaggio Chiave</div>
              <h3 className="text-2xl lg:text-3xl font-bold text-stone-900">Da bracciante a stratega militare</h3>
            </div>
            <p className="text-sm lg:text-base text-stone-700 leading-relaxed">
              Nato a Rionero in Vulture, Carmine Crocco divenne il capo indiscusso del brigantaggio lucano. Dotato di un carisma straordinario, riuscì a federare decine di bande, arrivando a comandare oltre 2.000 uomini.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs lg:text-sm pt-1">
              <div className="bg-amber-900/5 p-3 rounded-lg border border-amber-900/10">
                <strong className="text-amber-900">Mente tattica:</strong> Sfruttò la foresta di Monticchio come base inespugnabile.
              </div>
              <div className="bg-amber-900/5 p-3 rounded-lg border border-amber-900/10">
                <strong className="text-amber-900">Fine politico:</strong> Si alleò con i comitati borbonici per ottenere armi e legittimazione.
              </div>
            </div>
            <div className="mt-2 bg-[#3F2A1D] text-amber-100 p-3 lg:p-4 rounded-xl text-xs lg:text-sm">
              Arrestato nel 1864 dopo il tradimento del suo luogotenente Caruso, scampò alla pena di morte e dettò le sue celebri memorie in carcere.
            </div>
          </div>
        </div>
      ),
      speaker: "Lapomarda Davide",
      color: "#2F4F4F",
      notes: "Additional historical context added.Davide: Crocco è il simbolo assoluto. Spiega che aveva un'intelligenza militare innata, pur essendo analfabeta. Riusciva a muovere 2.000 uomini senza radio o mappe."
    },
    {
      id: 9,
      title: "9. NINCO NANCO",
      subtitle: "La ferocia al servizio della rivolta",
      content: (
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 items-center">
          <div className="flex-1 space-y-4">
            <div>
              <div className="text-xl lg:text-2xl font-serif text-stone-800">Giuseppe Nicola Summa</div>
              <div className="text-2xl lg:text-3xl font-bold text-amber-900 tracking-[3px]">NINCO NANCO</div>
            </div>
            <p className="text-sm lg:text-base text-stone-700 leading-relaxed">
              Il più fidato e temuto luogotenente di Crocco. Celebre per il suo coraggio spregiudicato ma anche per la sua estrema e teatrale efferatezza contro i soldati catturati.
            </p>
            <div className="bg-stone-900 text-amber-100 p-4 lg:p-6 rounded-2xl text-xs lg:text-sm space-y-3 shadow-md">
              <p className="font-semibold text-amber-400">Il ruolo della violenza simbolica:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-stone-300">
                <li>Serviva a incutere un terrore paralizzante nei reparti della Guardia Nazionale.</li>
                <li>Rafforzava l'autorità interna alla banda, dove ogni segno di debolezza era fatale.</li>
                <li>Rappresentava la vendetta brutale del sottoproletariato contro i 'signori'.</li>
              </ul>
              <p className="text-amber-500 pt-2 border-t border-stone-800 font-medium">
                Catturato e subito ucciso a Frusci nel 1864, per impedirgli di rivelare le complicità dei notabili locali.
              </p>
            </div>
          </div>
          <div className="w-full lg:w-72 shrink-0">
            <SlideMap
              center={[40.85, 15.65]}
              zoom={10}
              markers={[
                { lat: 40.85, lng: 15.65, title: 'Avigliano', desc: 'Città natale di Ninco Nanco' },
                { lat: 40.80, lng: 15.70, title: 'Frusci', desc: 'Luogo della sua uccisione (1864)' }
              ]}
              onExpand={() => setLightbox({ kind: 'map', title: 'I luoghi di Ninco Nanco', caption: 'Giuseppe Nicola Summa — Avigliano, 1833 – Frusci, 1864', info: `Luogotenente di Crocco, Ninco Nanco operò tra i boschi dell'alta Basilicata. La sua cattura nel luglio 1864 fu seguita dall'esecuzione immediata: le autorità militari temevano che potesse rivelare i nomi dei complici tra i notabili locali, cosa che avrebbe scatenato uno scandalo politico di proporzioni enormi. Il suo corpo fu esposto pubblicamente per scoraggiare altri dalla resistenza.`, center: [40.85, 15.65], zoom: 10, markers: [{ lat: 40.85, lng: 15.65, title: 'Avigliano', desc: 'Città natale di Ninco Nanco' }, { lat: 40.80, lng: 15.70, title: 'Frusci', desc: 'Luogo della sua uccisione (1864)' }] })}
            />
            <div className="text-xs text-center mt-2 text-stone-500 italic">I luoghi di Ninco Nanco</div>
          </div>
        </div>
      ),
      speaker: "Lapomarda Davide",
      color: "#2F4F4F",
      notes: "Additional historical context added.Davide: Ninco Nanco rappresenta la rabbia pura. Fu ucciso subito dopo la cattura perché conosceva i nomi dei ricchi che facevano il doppio gioco."
    },
    {
      id: 10,
      title: "10. JOSÉ BORJES",
      subtitle: "Il tragico sogno di un esercito regolare",
      content: (
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          <div className="flex-1 space-y-4">
            <p className="text-sm lg:text-base text-stone-800 leading-relaxed">
              Il generale catalano José Borjes fu inviato dal re in esilio Francesco II per trasformare le bande indisciplinate in un vero esercito di liberazione legittimista.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs lg:text-sm">
              <div className="border border-green-800/20 p-4 rounded-xl bg-green-50/50">
                <strong className="text-green-900 block mb-1">L'Obiettivo:</strong>
                Imporre la disciplina militare, vietare i saccheggi inutili e coordinare una marcia su Napoli.
              </div>
              <div className="border border-red-800/20 p-4 rounded-xl bg-red-50/50">
                <strong className="text-red-900 block mb-1">Il Fallimento:</strong>
                Crocco, geloso della propria leadership, rifiutò di sottomettersi a un comandante straniero.
              </div>
            </div>
            <div className="bg-white/60 p-3 lg:p-4 rounded-xl border border-amber-900/10 text-xs lg:text-sm text-stone-700">
              Abbandonato dai briganti, Borjes tentò di fuggire verso lo Stato Pontificio ma fu catturato a Tagliacozzo e fucilato dal maggiore Franchini l'8 dicembre 1861.
            </div>
          </div>
          <div className="w-full lg:w-72 shrink-0">
            <SlideMap
              center={[40.5, 14.5]}
              zoom={6}
              markers={[
                { lat: 38.05, lng: 16.05, title: 'Sbarco in Calabria', desc: 'Brancaleone, sett. 1861' },
                { lat: 42.08, lng: 13.08, title: 'Fucilazione', desc: 'Tagliacozzo, dic. 1861' }
              ]}
              onExpand={() => setLightbox({ kind: 'map', title: 'La parabola di José Borjes', caption: 'Tarragona 1813 – Tagliacozzo, 8 dicembre 1861', info: `Il generale catalano José Borjes sbarcò a Brancaleone (Calabria) nel settembre 1861 con l'incarico di trasformare le bande in un esercito regolare per Francesco II. Crocco rifiutò di subordinarsi a un comandante straniero e sabotò ogni tentativo di disciplina militare. Abbandonato, Borjes tentò la fuga verso lo Stato Pontificio ma fu catturato dai bersaglieri del maggiore Franchini a Tagliacozzo e fucilato l'8 dicembre 1861. Lasciò un diario di straordinaria lucidità.`, center: [40.5, 14.5], zoom: 6, markers: [{ lat: 38.05, lng: 16.05, title: 'Sbarco in Calabria', desc: 'Brancaleone, sett. 1861' }, { lat: 42.08, lng: 13.08, title: 'Fucilazione', desc: 'Tagliacozzo, dic. 1861' }] })}
            />
            <div className="text-xs text-center mt-2 text-stone-500 italic">La parabola del generale Borjes</div>
          </div>
        </div>
      ),
      speaker: "Lapomarda Davide",
      color: "#2F4F4F",
      notes: "Additional historical context added.Davide: Borjes tenne un diario famosissimo in cui scrisse: 'Crocco è un mostro, i suoi uomini non vogliono la causa del Re, vogliono solo saccheggiare'. Fine parte Davide."
    },
    // === ELISEY ROTAR: Slides 11-14 (LA PARTE PIÙ FACILE E MEMORIZZABILE) ===
    {
      id: 11,
      title: "11. LA REPRESSIONE DELLO STATO",
      subtitle: "La risposta militare italiana (Elisey)",
      content: (
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 items-center">
          <div className="flex-1 space-y-4">
            <div className="text-center lg:text-left">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-widest block mb-1">L'Intervento di Massa</span>
              <div className="text-xl lg:text-2xl text-stone-900">
                Lo Stato inviò circa <strong className="text-amber-900 text-3xl lg:text-4xl">100.000 soldati</strong> nel Sud
              </div>
            </div>
            
            <p className="text-sm lg:text-base text-stone-700 leading-relaxed">
              Per non perdere il controllo del Mezzogiorno, il governo di Torino decise di rispondere con la forza massima. Quasi metà dell'intero esercito italiano fu schierato nelle province meridionali.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 lg:gap-3 text-xs lg:text-sm">
              {["Rastrellamenti", "Posti di blocco", "Perquisizioni", "Arresti di massa", "Fucilazioni", "Confische"].map((t, i) => (
                <div key={i} className="p-2.5 bg-white border border-stone-200 rounded-lg text-center font-semibold text-stone-800 shadow-2xs">
                  {t}
                </div>
              ))}
            </div>

            <div className="p-3 lg:p-4 bg-stone-900 text-amber-50 rounded-xl text-center text-xs lg:text-sm font-medium">
              Comandanti supremi: <span className="text-amber-400">Enrico Cialdini</span> e <span className="text-amber-400">Emilio Pallavicini</span>
            </div>
          </div>
          <div className="w-full lg:w-72 shrink-0">
            <div className="relative group cursor-pointer" onClick={() => setLightbox({ kind: 'image', src: `${import.meta.env.BASE_URL}images/repressione.jpg`, title: 'La repressione militare', caption: 'Truppe regolari in operazione nel Mezzogiorno (1861–1865)', info: `Tra il 1861 e il 1865, il governo italiano dislocò circa 100.000 soldati nel Mezzogiorno — quasi la metà dell'intero esercito nazionale. La campagna fu guidata dai generali Enrico Cialdini ed Emilio Pallavicini, che applicarono una strategia di terrore collettivo: rastrellamenti, esecuzioni sommarie, distruzione dei raccolti, deportazioni. La legge Pica del 1863 sospese i diritti civili nelle province 'infette', sottoponendo i civili ai tribunali militari.` })}>
              <img src={`${import.meta.env.BASE_URL}images/repressione.jpg`} alt="Esercito italiano" className="w-full h-48 lg:h-60 object-cover rounded-2xl shadow-md border border-amber-900/20 transition group-hover:brightness-90" />
              <div className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-lg shadow border border-stone-200 text-stone-600 opacity-0 group-hover:opacity-100 transition pointer-events-none">
                <Maximize2 size={12} />
              </div>
            </div>
            <div className="text-xs text-center mt-2 text-stone-500 italic">Truppe regolari in marcia nel Sud</div>
          </div>
        </div>
      ),
      speaker: "Elisey Rotar",
      color: "#4A3728",
      notes: "Additional historical context added.Elisey: Questa è la tua parte! Spiega in modo semplice: lo Stato mandò 100.000 soldati. Fu una vera guerra. I generali Cialdini e Pallavicini usarono il pugno di ferro."
    },
    {
      id: 12,
      title: "12. LA LEGGE PICA (1863)",
      subtitle: "La sospensione dello Stato di diritto (Elisey)",
      content: (
        <div className="max-w-4xl mx-auto space-y-5">
          <p className="text-base lg:text-lg text-stone-900 text-center font-medium">
            Per velocizzare la repressione, il Parlamento approvò una legge eccezionale che sospendeva i diritti costituzionali:
          </p>
          
          <div className="space-y-2.5 text-sm lg:text-base max-w-2xl mx-auto">
            {[
              "Tribunali Militari: i civili venivano giudicati dall'esercito.",
              "Fucilazione immediata per chi veniva trovato con armi.",
              "Arresti su semplice sospetto, senza prove o mandato.",
              "Domicilio coatto (deportazione) per i familiari dei briganti.",
              "Punizioni collettive per i paesi accusati di dare rifugio."
            ].map((item, idx) => (
              <div key={idx} className="flex gap-3 items-center p-3 bg-white/80 rounded-xl border border-amber-900/10 shadow-2xs">
                <span className="text-amber-800 font-bold text-base shrink-0">⚖️</span>
                <span className="text-stone-800 font-medium">{item}</span>
              </div>
            ))}
          </div>

          <div className="p-3 bg-amber-900/5 rounded-xl text-center text-xs lg:text-sm text-stone-600 max-w-xl mx-auto italic">
            Lo Stato liberale rinunciò ai suoi stessi principi per ristabilire l'ordine con la forza.
          </div>
        </div>
      ),
      speaker: "Elisey Rotar",
      color: "#4A3728",
      notes: "Additional historical context added.Elisey: Slide importantissima ma facilissima. Ricorda i punti chiave: tribunali militari, fucilazione immediata e arresti senza prove. La Legge Pica legalizzò la repressione."
    },
    {
      id: 13,
      title: "13. GUERRA CONTRO I CIVILI",
      subtitle: "I villaggi diventano bersagli (Elisey)",
      content: (
        <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8 items-center">
          <div className="flex-1 space-y-4">
            <p className="text-base lg:text-lg text-stone-900 leading-relaxed">
              La strategia del generale Cialdini fu spietata: per isolare le bande, bisognava terrorizzare i contadini che le sostenevano.
            </p>
            
            <div className="flex flex-wrap gap-2 lg:gap-3">
              {["Incendi di interi paesi", "Esecuzioni sommarie di sospetti", "Distruzione dei raccolti", "Deportazioni al Nord (Fenestrelle)"].map(t => (
                <div key={t} className="px-4 py-2 bg-red-900/90 text-white rounded-lg text-xs lg:text-sm font-medium">
                  {t}
                </div>
              ))}
            </div>

            <div className="p-4 bg-white/60 rounded-xl border border-red-900/10 text-xs lg:text-sm text-stone-700 space-y-2">
              <p className="font-semibold text-red-900">Il dramma delle rappresaglie:</p>
              <p>
                Se un paese accoglieva i briganti, l'esercito lo considerava complice. Chi non fuggiva in tempo rischiava la vita durante le operazioni di 'ripulitura'.
              </p>
            </div>
          </div>
          <div className="w-full lg:w-72 shrink-0">
            <SlideMap
              center={[41.27, 14.66]}
              zoom={11}
              markers={[
                { lat: 41.28, lng: 14.67, title: 'Pontelandolfo', desc: 'Teatro della feroce rappresaglia' },
                { lat: 41.26, lng: 14.65, title: 'Casalduni', desc: 'Raso al suolo per ordine militare' }
              ]}
              circles={[
                { center: [41.27, 14.66], radius: 5000, color: '#b91c1c' }
              ]}
              onExpand={() => setLightbox({ kind: 'map', title: 'Pontelandolfo e Casalduni', caption: 'Provincia di Benevento — 14 agosto 1861', info: `Dopo l'uccisione di 41 soldati della colonna di Ottajano, il generale Cialdini ordinò: "Di Pontelandolfo e Casalduni non rimanga pietra su pietra." Le truppe del capitano Melegari bruciarono entrambi i borghi il 14 agosto 1861, uccidendo un numero imprecisato di civili (le stime storiche variano da alcune decine a qualche centinaio). Oltre 3.000 abitanti furono costretti alla fuga. L'episodio fu rimosso per decenni dalla storiografia ufficiale e oggi è riconosciuto come strage di Stato.`, center: [41.27, 14.66], zoom: 11, markers: [{ lat: 41.28, lng: 14.67, title: 'Pontelandolfo', desc: 'Teatro della feroce rappresaglia' }, { lat: 41.26, lng: 14.65, title: 'Casalduni', desc: 'Raso al suolo per ordine militare' }], circles: [{ center: [41.27, 14.66] as [number, number], radius: 5000, color: '#b91c1c' }] })}
            />
            <div className="text-xs text-center mt-2 text-stone-500 italic">I luoghi del massacro del 1861</div>
          </div>
        </div>
      ),
      speaker: "Elisey Rotar",
      color: "#4A3728",
      notes: "Additional historical context added.Elisey: Spiega che la guerra non fu solo contro i briganti, ma colpì duramente anche i civili innocenti. Questo portò a episodi tragici come quello della prossima slide."
    },
    {
      id: 14,
      title: "14. PONTELANDOLFO E CASALDUNI",
      subtitle: "Il simbolo della violenza militare (Elisey)",
      content: (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-[#3F2A1D] text-amber-50 p-6 lg:p-8 rounded-2xl shadow-xl space-y-4">
            <div className="flex justify-between text-xs lg:text-sm text-amber-400 font-semibold border-b border-amber-800/50 pb-2">
              <span>📍 Provincia di Benevento</span>
              <span>📅 14 Agosto 1861</span>
            </div>
            
            <p className="text-base lg:text-xl leading-relaxed text-stone-100">
              Dopo che i briganti avevano ucciso 41 soldati italiani, il generale Cialdini ordinò una rappresaglia definitiva: <strong className="text-amber-400">"Di Pontelandolfo e Casalduni non rimanga pietra su pietra"</strong>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-xs lg:text-sm pt-2">
              <div className="bg-amber-900/40 p-3 rounded-lg border border-amber-800/30">
                <span className="block text-lg mb-1">🔥</span> Paesi incendiati
              </div>
              <div className="bg-amber-900/40 p-3 rounded-lg border border-amber-800/30">
                <span className="block text-lg mb-1">💀</span> Decine di civili uccisi
              </div>
              <div className="bg-amber-900/40 p-3 rounded-lg border border-amber-800/30">
                <span className="block text-lg mb-1">🏃</span> Oltre 3.000 sfollati
              </div>
            </div>
          </div>

          <p className="text-xs lg:text-sm text-center text-stone-600 italic">
            Un evento rimosso per decenni dalla storiografia ufficiale, oggi riconosciuto come strage di Stato.
          </p>
        </div>
      ),
      speaker: "Elisey Rotar",
      color: "#4A3728",
      notes: "Additional historical context added.Elisey: Concludi la tua parte con questo esempio forte. 41 soldati uccisi → l'esercito brucia due paesi interi. Passa la parola a Mabrouk per le conclusioni."
    },
    // === MABROUK OUERTANI: Slides 15-21 ===
    {
      id: 15,
      title: "15. IL DECLINO DEL BRIGANTAGGIO",
      subtitle: "1865-1870: La fine della guerriglia",
      content: (
        <div className="max-w-4xl mx-auto space-y-6">
          <p className="text-base lg:text-lg text-stone-800 text-center">
            Dopo il 1865 il fenomeno subì un rapido e inarrestabile tracollo, dovuto a:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm lg:text-base">
            {[
              "Efficacia spietata della Legge Pica e dei rastrellamenti.",
              "Tradimenti interni alle bande, incentivati da taglie in denaro.",
              "Stanchezza della popolazione rurale, stremata dalle violenze.",
              "Fine del supporto politico ed economico dei Borbone in esilio."
            ].map((t, i) => (
              <div key={i} className="p-4 bg-white/80 border-l-4 border-amber-900 rounded-r-xl shadow-2xs flex items-center">
                <span className="text-stone-800 font-medium">{t}</span>
              </div>
            ))}
          </div>
          <div className="p-4 bg-amber-900/10 rounded-xl text-center text-xs lg:text-sm text-amber-900 font-semibold">
            Con la presa di Roma (1870) e la fine dello Stato Pontificio, i briganti persero il loro ultimo rifugio sicuro.
          </div>
        </div>
      ),
      speaker: "Mabrouk Ouertani",
      color: "#6B4423",
      notes: "Additional historical context added.Mabrouk: Inizia la tua parte finale. Spiega che il brigantaggio fu sconfitto militarmente, ma le cause sociali rimasero tutte irrisolte."
    },
    {
      id: 16,
      title: "16. ALTRI BRIGANTI IMPORTANTI",
      subtitle: "Una mappa di leader in tutto il Sud",
      content: (
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm lg:text-base">
          {[
            { name: "Luigi Alonzi detto 'Chiavone'", area: "Confine Lazio-Abruzzo", desc: "Guardaboschi, guidò le bande filopapali con divisa da generale." },
            { name: "I Fratelli La Gala", area: "Campania (Matese)", desc: "Celebri per aver tenuto in scacco le truppe piemontesi per mesi." },
            { name: "Antonio Cozzolino ('Pilone')", area: "Vesuvio", desc: "Legittimista di ferro, agiva a ridosso di Napoli." },
            { name: "Domenico Fuoco", area: "Molise e Terra di Lavoro", desc: "L'ultimo ad arrendersi, ucciso solo nel 1870." }
          ].map((b, i) => (
            <div key={i} className="p-4 bg-white/60 border border-amber-900/15 rounded-xl space-y-1">
              <div className="font-bold text-amber-900 text-base">{b.name}</div>
              <div className="text-xs font-semibold text-stone-500 uppercase">{b.area}</div>
              <p className="text-xs lg:text-sm text-stone-700 pt-1">{b.desc}</p>
            </div>
          ))}
        </div>
      ),
      speaker: "Mabrouk Ouertani",
      color: "#6B4423",
      notes: "Additional historical context added.Mabrouk: Mostra che il fenomeno non era limitato a Crocco. Ogni regione aveva i suoi capibanda, spesso ex militari o contadini."
    },
    {
      id: 17,
      title: "17-18. BRIGANTAGGIO E CRIMINALITÀ",
      subtitle: "Le scorie lasciate nel tessuto sociale",
      content: (
        <div className="max-w-4xl mx-auto space-y-6">
          <p className="text-base lg:text-lg text-stone-900 leading-relaxed text-center">
            Il brigantaggio non era mafia, ma la sua repressione creò un vuoto in cui la criminalità organizzata potè prosperare:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs lg:text-sm">
            <div className="bg-white/80 p-4 rounded-xl border border-stone-200 shadow-2xs">
              <strong className="text-amber-900 block mb-1">Sfiducia nello Stato</strong>
              Le popolazioni si convinsero che la legge fosse solo lo strumento dei forti contro i deboli.
            </div>
            <div className="bg-white/80 p-4 rounded-xl border border-stone-200 shadow-2xs">
              <strong className="text-amber-900 block mb-1">Ruolo dei Campieri</strong>
              I latifondisti assoldarono ex briganti e criminali per proteggere le terre, legalizzando la violenza privata.
            </div>
            <div className="bg-white/80 p-4 rounded-xl border border-stone-200 shadow-2xs">
              <strong className="text-amber-900 block mb-1">Omertà come Difesa</strong>
              Il silenzio divenne l'unico scudo per sopravvivere tra le vendette dei banditi e i tribunali militari.
            </div>
          </div>

          <div className="p-3 bg-amber-100 rounded-xl text-center text-xs lg:text-sm text-stone-800 font-medium">
            In Campania e Sicilia, Camorra e Mafia approfittarono del caos per stringere patti di potere con la nuova classe politica liberale.
          </div>
        </div>
      ),
      speaker: "Mabrouk Ouertani",
      color: "#6B4423",
      notes: "Additional historical context added.Mabrouk: Spiega bene questo passaggio: lo Stato represse i briganti ma si appoggiò ai 'mazzieri' e ai mafiosi locali per mantenere l'ordine e i voti."
    },
    {
      id: 18,
      title: "19. INTERPRETAZIONI STORICHE",
      subtitle: "Il dibattito storiografico aperto",
      content: (
        <div className="max-w-4xl mx-auto space-y-3 lg:space-y-4">
          {[
            { label: "Tesi Ufficiale (Ottocento)", desc: "Semplice criminalità e banditismo, feccia sociale da eliminare per difendere la civiltà (Lombroso, Massari)." },
            { label: "Tesi Sociale (Marxista)", desc: "Il primo grande sciopero armato e lotta di classe dei contadini d'Italia contro il latifondo borghese (Gramsci, Molfese)." },
            { label: "Tesi Neo-Borbonica", desc: "Guerra di liberazione patriottica del popolo meridionale contro l'invasione e il saccheggio piemontese." },
            { label: "Storiografia Moderna", desc: "Fenomeno poliedrico: una guerra civile in cui si fusero miseria, reazione politica e traumi da rapida modernizzazione." }
          ].map((int, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-1 sm:gap-4 items-start sm:items-center p-3 lg:p-4 bg-white/70 rounded-xl border-l-4 border-stone-800 shadow-2xs">
              <span className="font-bold text-xs lg:text-sm text-stone-900 w-full sm:w-44 shrink-0">{int.label}</span>
              <p className="text-xs lg:text-sm text-stone-700">{int.desc}</p>
            </div>
          ))}
        </div>
      ),
      speaker: "Mabrouk Ouertani",
      color: "#6B4423",
      notes: "Additional historical context added.Mabrouk: Mostra che non esiste una sola verità. La tesi moderna è la più completa perché unisce tutte le sfaccettature."
    },
    {
      id: 19,
      title: "20. LE CONSEGUENZE",
      subtitle: "L'eredità del decennio di sangue",
      content: (
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs lg:text-sm">
            {[
              { title: "📉 Collasso Economico", text: "Campagne devastate, bestiame decimato e capitali fuggiti. Il divario industriale con il Nord divenne incolmabile." },
              { title: "💔 Frattura Sociale", text: "Si radicò il pregiudizio anti-meridionale: il Sud venne visto come una palla al piede, ribelle e arretrata." },
              { title: "🌍 La Grande Emigrazione", text: "Senza terra e senza speranza, milioni di contadini scelsero l'esilio verso le Americhe a partire dal 1880." },
              { title: "📚 La Questione Meridionale", text: "Nacque la consapevolezza che l'Unità era incompiuta senza un vero piano di riscatto per il Mezzogiorno." }
            ].map((c, i) => (
              <div key={i} className="p-4 bg-white border border-amber-900/15 rounded-xl space-y-1">
                <div className="font-bold text-amber-900 text-sm lg:text-base">{c.title}</div>
                <p className="text-stone-700 leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
          <div className="p-3 bg-amber-900/10 rounded-xl text-center text-xs lg:text-sm font-semibold text-stone-900">
            L'emigrazione di massa fu la valvola di sfogo che sostituì la ribellione armata.
          </div>
        </div>
      ),
      speaker: "Mabrouk Ouertani",
      color: "#6B4423",
      notes: "Additional historical context added.Mabrouk: Spiega che i contadini, sconfitti con i fucili, decisero di 'votare con i piedi', andandosene in America."
    },
    {
      id: 20,
      title: "21. CONCLUSIONE",
      subtitle: "Il bilancio storico",
      content: (
        <div className="max-w-4xl mx-auto text-center space-y-6 lg:space-y-8">
          <div className="text-4xl lg:text-5xl text-amber-900/20">❧</div>
          <p className="text-base lg:text-xl leading-relaxed text-stone-900 font-medium">
            "L'Unità d'Italia fu un processo storicamente necessario, ma le sue modalità d'attuazione imposero un prezzo altissimo alle plebi meridionali."
          </p>
          <div className="p-4 lg:p-6 bg-white/80 rounded-2xl border border-amber-900/20 max-w-2xl mx-auto shadow-sm space-y-3">
            <p className="text-xs lg:text-sm text-stone-700">
              Lo Stato liberale, portatore di ideali di libertà e progresso, si trovò a dover difendere la propria esistenza applicando metodi autoritari e illiberali.
            </p>
            <div className="flex justify-center items-center gap-3 font-bold text-xs lg:text-sm text-amber-900 pt-1">
              <span>UNIFICAZIONE POLITICA</span>
              <span className="text-stone-400">≠</span>
              <span>UNIFICAZIONE SOCIALE</span>
            </div>
          </div>
          <p className="text-xs lg:text-sm text-stone-500 italic">
            Il brigantaggio rimane lo specchio delle profonde contraddizioni che hanno accompagnato la nascita dell'Italia.
          </p>
        </div>
      ),
      speaker: "Mabrouk Ouertani",
      color: "#6B4423",
      notes: "Additional historical context added.Mabrouk: Conclusione solenne. L'Italia fu fatta, ma gli italiani rimasero divisi. Ringrazia la classe per l'attenzione."
    },
    {
      id: 21,
      title: "SINTESI GEOGRAFICA",
      subtitle: "Mappa riepilogativa dei luoghi chiave",
      content: (
        <div className="max-w-5xl mx-auto space-y-3">
          <div 
            ref={finalMapRef} 
            className="h-[260px] lg:h-[380px] w-full rounded-2xl overflow-hidden shadow-md border border-amber-900/20" 
          />
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-amber-900/10 p-2 rounded">🟤 <strong>Crocco</strong> (Vulture)</div>
            <div className="bg-red-900/10 p-2 rounded">🔴 <strong>Massacri</strong> (Sannio)</div>
            <div className="bg-stone-900/10 p-2 rounded">⚫ <strong>Borjes</strong> (Calabria)</div>
          </div>
        </div>
      ),
      speaker: "Tutti",
      color: "#3F2A1D",
      notes: "Additional historical context added.Mappa finale a disposizione per eventuali domande geografiche della classe o dei professori.",
    },
    {
      id: 22,
      title: "FINE PRESENTAZIONE",
      subtitle: "Grazie per l'attenzione",
      content: (
        <div className="max-w-xl mx-auto text-center space-y-6 lg:space-y-8 pt-4">
          <div className="text-3xl lg:text-4xl text-amber-900/20">†</div>
          <div className="space-y-2">
            <div className="text-xl lg:text-2xl font-serif font-bold text-stone-800">Erik Zorza</div>
            <div className="text-xl lg:text-2xl font-serif font-bold text-stone-800">Lapomarda Davide</div>
            <div className="text-xl lg:text-2xl font-serif font-bold text-stone-800">Elisey Rotar</div>
            <div className="text-xl lg:text-2xl font-serif font-bold text-stone-800">Mabrouk Ouertani</div>
          </div>
          <div className="text-xs lg:text-sm text-stone-500 border-t border-amber-900/10 pt-4">
            Lezione di Storia • Anno Scolastico 2026
          </div>
          <div className="text-[10px] lg:text-xs tracking-[2px] text-amber-800 uppercase">
            Fonti: Archivio di Stato • Memorie di Crocco • Storiografia sul Risorgimento
          </div>
          <div className="text-lg lg:text-xl italic text-amber-900 font-semibold pt-2">
            ❝ Ci sono domande? ❞
          </div>
        </div>
      ),
      speaker: "Tutti",
      color: "#3F2A1D",
      notes: "Additional historical context added.Fine della presentazione. Lasciate questa slide di sfondo mentre rispondete alle domande della classe."
    },
  ];

  const goToSlide = (index: number) => {
    const newIndex = Math.max(0, Math.min(slides.length - 1, index));
    setCurrentSlide(newIndex);
    setShowNotes(false);
  };

  const nextSlide = () => goToSlide(currentSlide + 1);
  const prevSlide = () => goToSlide(currentSlide - 1);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLightbox(null); setShowMusicInfo(false); return; }
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextSlide(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevSlide(); }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); setShowNotes(!showNotes); }
      if (e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFullscreen(); }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); nextSlide(); }
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); prevSlide(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, showNotes]);

  // Init final static map
  useEffect(() => {
    if (currentSlide === 21) {
      setTimeout(initFinalMap, 300);
    }
  }, [currentSlide, initFinalMap]);

  // Cleanup final map
  useEffect(() => {
    return () => {
      if (finalLeafletMap.current) {
        finalLeafletMap.current.remove();
        finalLeafletMap.current = null;
      }
    };
  }, []);

  const current = slides[currentSlide];
  const progress = ((currentSlide + 1) / slides.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5ede0] to-[#efe6d5] text-[#3F2A1D] font-serif selection:bg-amber-900 selection:text-white overflow-x-hidden flex flex-col justify-between">
      
      {/* Top Header & Audio Switch */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#f5ede0]/95 border-b border-amber-900/20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 lg:px-8 h-14 flex items-center justify-between text-xs lg:text-sm">
          
          {/* Left Title */}
          <div className="flex items-center gap-2">
            <div className="font-bold tracking-[1px] lg:tracking-[2px] text-xs lg:text-base text-stone-900">
              BRIGANTAGGIO <span className="hidden sm:inline">1861-1870</span>
            </div>
            <div className="px-1.5 py-0.5 text-[9px] lg:text-[10px] border border-amber-900/40 rounded uppercase tracking-wider bg-amber-900/5 text-amber-900 font-sans font-semibold">
              Slide
            </div>
          </div>

          {/* Center/Right Controls */}
          <div className="flex items-center gap-1.5 lg:gap-3">
            
            {/* Music Switcher */}
            <div className="relative">
              <div className="flex items-center gap-1 bg-white/60 px-2 py-1 rounded-full border border-amber-900/15">
                <button
                  onClick={() => setMusicEnabled(!musicEnabled)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-sans font-bold text-[10px] lg:text-xs transition ${
                    musicEnabled ? 'bg-amber-900 text-white shadow-2xs' : 'text-stone-600 hover:text-stone-900'
                  }`}
                  title="Attiva/Disattiva sottofondo musicale"
                >
                  <Music size={10} />
                  <span>{musicEnabled ? 'MUSICA ON' : 'MUSICA OFF'}</span>
                </button>

                {musicEnabled && (
                  <div className="flex items-center gap-1 pl-1 border-l border-stone-200">
                    <button
                      onClick={() => setAudioMode(audioMode === 'verdi' ? 'synth' : 'verdi')}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-sans text-[9px] lg:text-[10px] font-semibold hover:bg-amber-200 transition"
                      title="Cambia sorgente audio"
                    >
                      <Disc size={9} className={audioMode === 'verdi' ? 'animate-spin' : ''} style={{ animationDuration: '4s' }} />
                      <span className="hidden md:inline">{audioMode === 'verdi' ? "La forza del destino" : "Sintesi Atmosfera"}</span>
                      <span className="md:hidden">{audioMode === 'verdi' ? "Verdi" : "Sint."}</span>
                    </button>

                    <div className="hidden sm:flex items-center gap-0.5 px-1">
                      {musicVolume === 0 ? <VolumeX size={10} className="text-stone-400" /> : <Volume2 size={10} className="text-amber-900" />}
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={musicVolume}
                        onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                        className="w-12 h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-900"
                        title="Volume"
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowMusicInfo(!showMusicInfo)}
                  className={`ml-0.5 flex items-center justify-center w-5 h-5 rounded-full transition ${
                    showMusicInfo ? 'bg-amber-900 text-white' : 'text-stone-400 hover:text-amber-900'
                  }`}
                  title="Informazioni sul brano"
                >
                  <Info size={10} />
                </button>
              </div>

              {showMusicInfo && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-[#fdf8f0] border border-amber-900/25 rounded-2xl shadow-2xl p-4 z-[100] font-sans">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-amber-900 text-sm leading-tight">«Pace, pace, mio Dio!»</div>
                      <div className="text-xs text-stone-500 italic mt-0.5">da <em>La forza del destino</em></div>
                    </div>
                    <button onClick={() => setShowMusicInfo(false)} className="text-stone-400 hover:text-stone-700 text-xs ml-2">✕</button>
                  </div>
                  <dl className="text-xs space-y-1.5 text-stone-700 mb-3">
                    <div className="flex gap-2">
                      <dt className="font-semibold text-stone-500 w-24 shrink-0">Compositore</dt>
                      <dd>Giuseppe Verdi</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-stone-500 w-24 shrink-0">Anno</dt>
                      <dd>1862 · Prima: San Pietroburgo</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-stone-500 w-24 shrink-0">Interprete</dt>
                      <dd>Eugenia Burzio, soprano</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-stone-500 w-24 shrink-0">Licenza</dt>
                      <dd>CC BY-SA 4.0 · Wikimedia Commons</dd>
                    </div>
                  </dl>
                  <p className="text-xs text-stone-600 leading-relaxed border-t border-amber-900/10 pt-3">
                    L'aria è cantata da Leonora, esule e distrutta dalla guerra, che supplica Dio di concederle pace e morte dopo anni di sofferenza. Verdi compose quest'opera tra il 1861 e il 1862 — esattamente mentre il brigantaggio insanguinava il Mezzogiorno d'Italia.
                  </p>
                </div>
              )}
            </div>

            {/* Speaker Indicator */}
            <div className="hidden sm:flex items-center gap-1 text-xs px-2.5 py-1 bg-white/80 rounded-full border border-amber-900/20">
              <User size={10} />
              <span className="font-semibold text-[11px]" style={{color: speakers[current.speaker]?.color || '#3F2A1D'}}>
                {current.speaker}
              </span>
            </div>

            {/* Notes Toggle */}
            <button 
              onClick={() => setShowNotes(!showNotes)} 
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full transition text-[10px] lg:text-xs font-sans font-semibold border ${
                showNotes ? 'bg-amber-900 text-white border-amber-900' : 'bg-white/80 text-stone-700 border-amber-900/20 hover:bg-white'
              }`}
              title="Mostra/Nascondi Note per il Relatore (Tasto S)"
            >
              <BookOpen size={10} />
              <span className="hidden md:inline">NOTE</span>
            </button>

            {/* Fullscreen */}
            <button 
              onClick={toggleFullscreen} 
              className="p-1.5 hover:bg-white/80 rounded-full border border-amber-900/20 text-stone-700"
              title="Schermo Intero (Tasto F)"
            >
              {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>

          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-0.5 bg-amber-900/10">
          <div 
            className="h-full bg-gradient-to-r from-amber-900 to-amber-600 transition-all duration-300" 
            style={{ width: `${progress}%` }} 
          />
        </div>
      </header>

      {/* Hidden Audio Source */}
      <audio 
        ref={audioRef} 
        src="https://upload.wikimedia.org/wikipedia/commons/5/50/ICBSA_Verdi_-_Nabucco%2C_Va_pensiero.ogg"
        loop 
        preload="auto"
      />

      {/* Main Slide Content Area with Swipe Support */}
      <main 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="pt-16 pb-20 flex-1 flex items-center justify-center px-3 lg:px-8"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`slide-${currentSlide}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="max-w-6xl w-full"
          >
            {/* Slide Header */}
            <div className="flex items-end justify-between mb-3 lg:mb-4 px-1">
              <div>
                <div className="text-[10px] lg:text-xs tracking-[2px] text-amber-800 mb-0.5 uppercase font-sans font-bold" style={{color: speakers[current.speaker]?.color}}>
                  {current.speaker}
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-stone-900 leading-tight">
                  {current.title}
                </h1>
                {current.subtitle && (
                  <p className="text-xs sm:text-sm lg:text-base text-amber-900 mt-0.5 font-medium">
                    {current.subtitle}
                  </p>
                )}
              </div>
              <div className="text-right text-xs lg:text-sm tabular-nums text-amber-900 font-mono font-semibold bg-amber-900/5 px-2 py-1 rounded border border-amber-900/10">
                {String(currentSlide + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
              </div>
            </div>

            {/* Inner Content Box */}
            <div className="bg-white/70 backdrop-blur-md border border-amber-900/15 rounded-2xl lg:rounded-3xl p-5 sm:p-8 lg:p-10 min-h-[340px] lg:min-h-[400px] shadow-lg flex flex-col justify-center">
              {current.content}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Speaker Notes Drawer */}
      <AnimatePresence>
        {showNotes && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-14 lg:bottom-16 left-0 right-0 bg-[#2b1d14] text-amber-50 p-4 lg:p-5 z-50 border-t-2 border-amber-700 shadow-2xl"
          >
            <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-2 sm:gap-6 items-start">
              <div className="text-[10px] lg:text-xs sm:w-24 shrink-0 tracking-wider text-amber-400 uppercase font-sans font-bold flex items-center gap-1">
                <span>💡 Da dire:</span>
              </div>
              <div className="flex-1 text-xs sm:text-sm lg:text-base leading-relaxed font-sans">
                {current.notes}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            key="lightbox-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 lg:p-8"
            onClick={() => setLightbox(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-[#fdf8f0] rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex justify-between items-start p-4 lg:p-5 border-b border-amber-900/15 shrink-0">
                <div>
                  <h2 className="font-bold text-base lg:text-lg text-stone-900 font-serif">{lightbox.title}</h2>
                  <p className="text-xs text-stone-500 italic mt-0.5">{lightbox.caption}</p>
                </div>
                <button
                  onClick={() => setLightbox(null)}
                  className="text-stone-400 hover:text-stone-700 p-1 ml-4 shrink-0"
                  title="Chiudi (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {lightbox.kind === 'image' ? (
                  <>
                    <div className="bg-stone-900 flex items-center justify-center" style={{ height: '55vh' }}>
                      <img src={lightbox.src} alt={lightbox.title} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="p-5 lg:p-6">
                      <p className="text-sm lg:text-base text-stone-700 leading-relaxed font-sans">{lightbox.info}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ height: '50vh' }}>
                      <LightboxMap
                        center={lightbox.center}
                        zoom={lightbox.zoom}
                        markers={lightbox.markers}
                        circles={lightbox.circles}
                      />
                    </div>
                    <div className="p-5 lg:p-6">
                      <p className="text-sm lg:text-base text-stone-700 leading-relaxed font-sans">{lightbox.info}</p>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#f5ede0]/95 border-t border-amber-900/20 backdrop-blur-md z-40">
        <div className="max-w-7xl mx-auto px-3 lg:px-8 h-14 lg:h-16 flex items-center justify-between">
          
          {/* Prev Button */}
          <button 
            onClick={prevSlide} 
            disabled={currentSlide === 0} 
            className="flex items-center gap-1 lg:gap-2 px-4 lg:px-6 py-2 rounded-full disabled:opacity-30 hover:bg-white active:bg-white transition border border-amber-900/20 text-xs lg:text-sm font-sans font-semibold text-stone-800 shadow-2xs"
          >
            <ChevronLeft size={16} />
            <span>PRECEDENTE</span>
          </button>

          {/* Center Gesture Hints */}
          <div className="hidden md:flex items-center gap-2 text-[11px] text-stone-500 font-sans">
            <span>Swipe ↔</span>
            <span className="text-stone-300">•</span>
            <span>Spazio / Frecce</span>
            <span className="text-stone-300">•</span>
            <span className="font-bold text-amber-900">S</span> Note
          </div>

          {/* Mobile Hint */}
          <div className="md:hidden text-[10px] text-stone-500 font-sans italic">
            Swipe per scorrere
          </div>

          {/* Next Button */}
          <button 
            onClick={nextSlide} 
            disabled={currentSlide === slides.length - 1}
            className="flex items-center gap-1 lg:gap-2 px-4 lg:px-6 py-2 rounded-full disabled:opacity-30 hover:bg-white active:bg-white transition border border-amber-900/20 text-xs lg:text-sm font-sans font-semibold text-stone-800 shadow-2xs"
          >
            <span>SUCCESSIVO</span>
            <ChevronRight size={16} />
          </button>

        </div>
      </footer>

    </div>
  );
};

export default App;