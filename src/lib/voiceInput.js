export function isVoiceSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function startListening(onResult, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    onError('Voice input is not supported in this browser.');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    onResult(transcript);
  };

  recognition.onerror = event => {
    const msg =
      event.error === 'not-allowed'
        ? 'Microphone permission denied. Please allow mic access.'
        : `Voice input error: ${event.error}`;
    onError(msg);
  };

  recognition.start();
  return recognition;
}

export function stopListening(recognition) {
  if (recognition) {
    try { recognition.stop(); } catch (_) { /* already stopped */ }
  }
}
