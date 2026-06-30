import {Composition} from 'remotion';
import {GundrukAd} from './GundrukAd';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GundrukAd"
        component={GundrukAd}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
