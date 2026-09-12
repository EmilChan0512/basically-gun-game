# Offline original tactical callout, using the same standard Windows voice as voice-kill.
Add-Type -AssemblyName System.Speech
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $taskSpeaker.SelectVoice('Microsoft Zira Desktop')
  $taskSpeaker.Rate = 1
  $taskSpeaker.SetOutputToWaveFile((Join-Path $taskRoot 'public/assets/audio/voice-reload.wav'))
  $taskSpeaker.Speak('Reloading. Cover me!')
} finally { $taskSpeaker.Dispose() }
