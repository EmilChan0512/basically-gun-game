# Render an original generic line with an installed standard voice, entirely offline.
Add-Type -AssemblyName System.Speech
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskSpeechFolder = Join-Path $taskRoot 'archaeology/local'
New-Item -ItemType Directory -Path $taskSpeechFolder -Force | Out-Null
$taskSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $taskSpeaker.SelectVoice('Microsoft Zira Desktop')
  $taskSpeaker.Rate = 0
  $taskSpeaker.SetOutputToWaveFile((Join-Path $taskSpeechFolder 'voice-kill.wav'))
  $taskSpeaker.Speak('Target eliminated.')
} finally { $taskSpeaker.Dispose() }
