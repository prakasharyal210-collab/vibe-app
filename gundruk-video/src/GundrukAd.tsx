import {AbsoluteFill, Audio, Sequence, spring, useCurrentFrame, useVideoConfig, staticFile, interpolate} from 'remotion';

const slides = [
  { text: "This app just dropped 🔥", bg: "#0f0f1a", accent: "#a855f7" },
  { text: "Share Posts & Reels 📸", bg: "#0a1628", accent: "#00d4ff" },
  { text: "Find Your Vibe ❤️", bg: "#1a0530", accent: "#ec4899" },
  { text: "Couple Mode 💑", bg: "#0a1628", accent: "#f59e0b" },
  { text: "Confession Room 💬", bg: "#0f0f1a", accent: "#a855f7" },
  { text: "100% FREE 🎉", bg: "#0a1628", accent: "#68d391" },
  { text: "Download GUNDRUK now! 🚀", bg: "#1a0530", accent: "#ec4899" },
];

const Slide: React.FC<{text: string; bg: string; accent: string; startFrame: number}> = ({text, bg, accent, startFrame}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const localFrame = frame - startFrame;

  const scale = spring({frame: localFrame, fps, config: {damping: 12, stiffness: 200}});
  const opacity = interpolate(localFrame, [0, 10, 50, 60], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: bg, justifyContent: 'center', alignItems: 'center', opacity}}>
      {/* Gradient circle */}
      <div style={{
        position: 'absolute',
        width: 600,
        height: 600,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accent}40, transparent)`,
        transform: `scale(${scale})`,
      }} />

      {/* App name */}
      <div style={{
        position: 'absolute',
        top: 120,
        fontSize: 72,
        fontWeight: 900,
        background: `linear-gradient(90deg, #00d4ff, #a855f7, #ec4899)`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        fontFamily: 'sans-serif',
        letterSpacing: -2,
      }}>
        GUNDRUK
      </div>

      {/* Main text */}
      <div style={{
        fontSize: 80,
        fontWeight: 800,
        color: '#fff',
        textAlign: 'center',
        padding: '0 60px',
        lineHeight: 1.2,
        fontFamily: 'sans-serif',
        transform: `scale(${scale})`,
        textShadow: `0 0 40px ${accent}`,
        zIndex: 1,
      }}>
        {text}
      </div>

      {/* Bottom CTA */}
      <div style={{
        position: 'absolute',
        bottom: 120,
        fontSize: 36,
        color: accent,
        fontFamily: 'sans-serif',
        fontWeight: 700,
        letterSpacing: 2,
      }}>
        Google Play & App Store
      </div>
    </AbsoluteFill>
  );
};

export const GundrukAd: React.FC = () => {
  const framesPerSlide = 64;

  return (
    <AbsoluteFill style={{backgroundColor: '#0f0f1a'}}>
      {slides.map((slide, i) => (
        <Sequence key={i} from={i * framesPerSlide} durationInFrames={framesPerSlide + 10}>
          <Slide {...slide} startFrame={i * framesPerSlide} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
