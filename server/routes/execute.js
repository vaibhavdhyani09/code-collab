const router = require('express').Router();
const axios = require('axios');

// Wandbox API — 100% free, no API key, no signup required
// Docs: https://wandbox.org/
const WANDBOX_URL = 'https://wandbox.org/api/compile.json';

// Map our language names → Wandbox compiler names
// Verified against https://wandbox.org/api/list.json
const WANDBOX_COMPILERS = {
  javascript: { compiler: 'nodejs-20.17.0' },
  typescript: { compiler: 'typescript-5.6.2' },
  python:     { compiler: 'cpython-3.13.8' },
  java:       { compiler: 'openjdk-jdk-22+36' },
  cpp:        { compiler: 'gcc-head',     options: '-std=c++17 -Wall' },
  c:          { compiler: 'gcc-head-c',   options: '-std=c17 -Wall' },
  go:         { compiler: 'go-1.23.2' },
  rust:       { compiler: 'rust-1.82.0' },
  ruby:       { compiler: 'ruby-4.0.2' },
};

// POST /api/execute
router.post('/', async (req, res) => {
  try {
    const { code, language, stdin = '' } = req.body;

    if (!code?.trim()) {
      return res.status(400).json({ error: 'No code provided', isError: true });
    }

    const lang = WANDBOX_COMPILERS[language];
    if (!lang) {
      return res.status(400).json({
        error: `Unsupported language: ${language}`,
        isError: true,
      });
    }

    const payload = {
      code,
      compiler: lang.compiler,
      stdin,
      ...(lang.options && { 'compiler-option-raw': lang.options }),
      save: false,
    };

    const response = await axios.post(WANDBOX_URL, payload, {
      timeout: 20000,
      headers: { 'Content-Type': 'application/json' },
    });

    const {
      status,
      program_output,
      program_error,
      compiler_error,
      compiler_output,
    } = response.data;

    // Build readable output
    let output = '';
    if (compiler_error)  output += `Compile Error:\n${compiler_error}\n`;
    if (program_output)  output += program_output;
    if (program_error)   output += program_error;
    if (!output.trim())  output  = 'Program exited with no output.';

    const isError = !!compiler_error || (status !== '0' && status !== 0);

    res.json({
      output,
      isError,
      status: compiler_error
        ? 'Compile Error'
        : isError
          ? `Runtime Error (exit ${status})`
          : 'Accepted',
    });

  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: 'Execution timed out (20s limit)',
        isError: true,
        status: 'Timeout',
      });
    }

    res.status(500).json({
      error: `Execution failed: ${err.message}`,
      isError: true,
      status: 'Service Error',
    });
  }
});

module.exports = router;
