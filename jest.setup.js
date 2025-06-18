// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock the Web Audio API
class MockAudioContext {
  constructor() {
    this.state = 'running'
    this.destination = {}
  }
  
  createBuffer() {
    return {
      copyToChannel: jest.fn(),
    }
  }
  
  createBufferSource() {
    return {
      buffer: null,
      connect: jest.fn(),
      start: jest.fn(),
    }
  }
  
  createGain() {
    return {
      gain: { value: 1 },
      connect: jest.fn(),
    }
  }
  
  async resume() {
    this.state = 'running'
  }
}

global.AudioContext = MockAudioContext 