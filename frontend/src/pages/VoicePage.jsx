import VoiceOrb from "../components/VoiceOrb.jsx";
import { PageHeader, usePageTitle } from "../components/Common.jsx";

export default function VoicePage() {
  usePageTitle("Voice agent");
  return (
    <div className="page voice-page">
      <PageHeader title="Voice agent" eyebrow="Voice"
                  subtitle="Tap the orb and start talking. Powered by ElevenLabs." />
      <VoiceOrb height={520} />
      <p className="caption">Leaving this page ends the call. Voice conversations are not saved.</p>
    </div>
  );
}
