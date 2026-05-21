import { Scene } from './scene/Scene';
import { Overlay } from './ui/Overlay';
import { useAudioEngine } from './audio/useAudioEngine';

function App() {
  const audio = useAudioEngine();
  return (
    <>
      <Scene getBands={audio.getBands} stateRef={audio.stateRef} />
      <Overlay audio={audio} />
    </>
  );
}

export default App;
