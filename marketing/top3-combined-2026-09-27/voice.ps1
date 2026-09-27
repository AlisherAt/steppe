$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$voiceOutput = Join-Path $PSScriptRoot 'voice'
New-Item -ItemType Directory -Force -Path $voiceOutput | Out-Null
$story = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'story.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Pavel')
$synth.Rate = 2
$synth.Volume = 95
try {
  for ($i = 0; $i -lt $story.Count; $i++) {
    for ($j = 0; $j -lt $story[$i].lines.Count; $j++) {
      $synth.SetOutputToWaveFile((Join-Path $voiceOutput "$i-$j.wav"))
      $synth.Speak($story[$i].lines[$j].text)
      $synth.SetOutputToNull()
    }
  }
} finally { $synth.Dispose() }
