# MPC3000/S3000 SND Player and Converter

A modern web application for playing and converting Akai S3000/MPC3000 SND files. Built with Next.js 14, React, and TypeScript.

## Features

- 🎵 SND file playback with pitch control

  **ROADMAP**
- 🔄 WAV to SND conversion (coming soon)
- 🎚️ Sample rate conversion
- 🔁 Loop point support
- 📊 Waveform visualization
- 🎛️ Sample editing capabilities

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/mpc3000-snd-player.git
cd mpc3000-snd-player
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### SND Player

1. Drag and drop an SND file onto the player or click to select a file
2. Use the transport controls to play, pause, and stop
3. Adjust the pitch using the slider
4. Monitor playback progress in the waveform display

### WAV to SND Converter (Coming Soon)

1. Upload a WAV file
2. Configure conversion settings
3. Convert and download the SND file

## Development

### Project Structure

```
src/
├── app/              # Next.js app router
├── components/       # React components
├── lib/             # Utility functions
└── types/           # TypeScript types
```

### Key Components

- `SndPlayer.tsx`: Main SND file player component
- `WavToSndConverter.tsx`: WAV to SND conversion component
- `lib/akaiSnd.ts`: SND file format utilities
- `lib/audioConverter.ts`: Audio conversion utilities

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned features and development timeline.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Akai Professional for the S3000/MPC3000 format specification
- The open-source community for various tools and libraries used in this project
