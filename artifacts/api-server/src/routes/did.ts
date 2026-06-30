import { Router } from 'express';

const router = Router();

const DID_API_KEY = 'cHJha2FzaGFyeWFsMjEwQGdtYWlsLmNvbTpzQTdSU0FpN0ZSdmpuZHlSR2dic0E=';

router.post('/create', async (req, res) => {
  try {
    const { script, avatar_url, voice_id } = req.body;
    const response = await fetch('https://api.d-id.com/talks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${DID_API_KEY}`,
      },
      body: JSON.stringify({
        source_url: avatar_url,
        script: {
          type: 'text',
          input: script,
          provider: {
            type: 'microsoft',
            voice_id: voice_id || 'en-US-JennyNeural',
          },
        },
        config: { fluent: true, pad_audio: 0 },
      }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create video' });
  }
});

router.get('/status/:id', async (req, res) => {
  try {
    const response = await fetch(`https://api.d-id.com/talks/${req.params.id}`, {
      headers: { 'Authorization': `Basic ${DID_API_KEY}` },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to check status' });
  }
});

export default router;
