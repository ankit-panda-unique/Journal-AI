import { useState, useReducer, useRef, useMemo, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, BarChart2, Coins, ReceiptText, Megaphone, Lightbulb, PlayCircle, Gauge, TrendingUp, HandCoins, PiggyBank, CircleAlert, CircleCheck, Info, Sun, Moon, RotateCcw, BookText } from 'lucide-react';

// Helper function to decode base64 string to ArrayBuffer
const base64ToArrayBuffer = (base64) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// Helper function to convert PCM data to WAV file format
const pcmToWav = (pcm16, sampleRate) => {
  const buffer = new ArrayBuffer(44 + pcm16.length * 2);
  const view = new DataView(buffer);
  view.setUint32(0, 0x52494646, true);
  view.setUint32(4, 36 + pcm16.length * 2, true);
  view.setUint32(8, 0x57415645, true);
  view.setUint32(12, 0x666d7420, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, true);
  view.setUint32(40, pcm16.length * 2, true);
  for (let i = 0; i < pcm16.length; i++) {
    view.setInt16(44 + i * 2, pcm16[i], true);
  }
  return new Blob([view], { type: 'audio/wav' });
};

// Function to make a Gemini API call with exponential backoff
const callGeminiAPI = async (payload, model) => {
  const apiKey = ""; // Canvas will inject this at runtime
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        return await response.json();
      }
      console.warn(`API call failed (attempt ${i + 1}), retrying...`);
      await new Promise(res => setTimeout(res, Math.pow(2, i) * 1000));
    } catch (e) {
      console.error(`Attempt ${i + 1} failed due to network error:`, e);
      await new Promise(res => setTimeout(res, Math.pow(2, i) * 1000));
    }
  }
  throw new Error("Failed to get a response from the AI after multiple retries. Please try again later.");
};

// Reducer for state management
const initialState = {
  isLoading: false,
  isSuggesting: false,
  isExplaining: false,
  isReading: false,
  isAnalyzing: false,
  isSuggestingAnalyzer: false,
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_SUGGESTING':
      return { ...state, isSuggesting: action.payload };
    case 'SET_EXPLAINING':
      return { ...state, isExplaining: action.payload };
    case 'SET_READING':
      return { ...state, isReading: action.payload };
    case 'SET_ANALYZING':
      return { ...state, isAnalyzing: action.payload };
    case 'SET_SUGGESTING_ANALYZER':
      return { ...state, isSuggestingAnalyzer: action.payload };
    case 'RESET_ALL':
      return initialState;
    default:
      throw new Error();
  }
};

const App = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [transactionDescription, setTransactionDescription] = useState('');
  const [journalEntry, setJournalEntry] = useState(null);
  const [explanationText, setExplanationText] = useState('');
  const [financialData, setFinancialData] = useState('');
  const [financialAnalysis, setFinancialAnalysis] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [isDarkMode, setIsDarkMode] = useState(true);
  const audioRef = useRef(null);
  
  // Animation variants for Framer Motion
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  const typingVariants = {
    hidden: { width: 0 },
    visible: { width: '100%', transition: { duration: 1, type: 'tween', ease: 'linear' } }
  };

  // Effect to load theme preference from local storage on initial render
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsDarkMode(false);
    }
  }, []);

  // Effect to save theme preference to local storage whenever it changes
  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Define the JSON schema for the AI's response for the journal entry
  const responseSchema = useMemo(() => ({
    type: "OBJECT",
    properties: {
      debitAccount: { "type": "STRING" },
      debitType: { "type": "STRING", "description": "Type of account (e.g., Personal, Real, Nominal)" },
      debitRule: { "type": "STRING", "description": "The Golden Rule for the debit account" },
      creditAccount: { "type": "STRING" },
      creditType: { "type": "STRING", "description": "Type of account (e.g., Personal, Real, Nominal)" },
      creditRule: { "type": "STRING", "description": "The Golden Rule for the credit account" },
      amount: { "type": "NUMBER", "description": "The monetary amount of the transaction." }
    },
    "propertyOrdering": ["debitAccount", "debitType", "debitRule", "creditAccount", "creditType", "creditRule", "amount"]
  }), []);

  // Define the JSON schema for the Financial Analyzer
  const analysisSchema = useMemo(() => ({
    type: "OBJECT",
    properties: {
      summary: { "type": "STRING", "description": "A high-level summary of the company's financial health." },
      income: { "type": "NUMBER", "description": "The calculated total income." },
      expenses: { "type": "NUMBER", "description": "The calculated total expenses." },
      netProfit: { "type": "NUMBER", "description": "The calculated net profit (income - expenses)." },
      trends: {
        "type": "ARRAY",
        "items": { "type": "STRING", "description": "Key financial trends identified from the data." }
      },
      suggestions: { "type": "STRING", "description": "Suggestions for improving financial health." }
    },
    "propertyOrdering": ["summary", "income", "expenses", "netProfit", "trends", "suggestions"]
  }), []);

  // Function to show a message box
  const showMessage = (text, type) => {
    setMessage({ text, type });
  };

  // Improved utility function to parse JSON with more robust error handling
  const parseJsonSafely = (jsonString) => {
    try {
      const trimmedString = jsonString.trim();
      const startIndex = trimmedString.indexOf('{');
      const endIndex = trimmedString.lastIndexOf('}');
      if (startIndex === -1 || endIndex === -1) {
        throw new Error('No valid JSON object found in the response.');
      }
      const cleanedString = trimmedString.substring(startIndex, endIndex + 1);
      return JSON.parse(cleanedString);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
      throw new Error(`The AI response was not in the expected JSON format. Details: ${e.message}`);
    }
  };

  // Function to reset the entire application state
  const handleReset = useCallback(() => {
    setTransactionDescription('');
    setJournalEntry(null);
    setExplanationText('');
    setFinancialData('');
    setFinancialAnalysis(null);
    setMessage({ text: '', type: '' });
    dispatch({ type: 'RESET_ALL' });
  }, []);

  // Event handlers for Journal Entry Generator
  const handleGenerateEntry = useCallback(async (e) => {
    e.preventDefault();
    if (!transactionDescription.trim()) {
      showMessage("Please enter a transaction to analyze.", 'error');
      return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    setJournalEntry(null);
    setExplanationText('');
    setMessage({ text: '', type: '' });

    try {
      const prompt = `Act as an expert accounting tutor. Analyze the following transaction and identify the two accounts involved, their type (Personal, Real, or Nominal), the specific Golden Rule of Accounting that applies, and the monetary amount.
      Transaction: "${transactionDescription}"
      Golden Rules of Accounting:
      - Personal Account: Debit the receiver, Credit the giver.
      - Real Account: Debit what comes in, Credit what goes out.
      - Nominal Account: Debit all expenses and losses, Credit all incomes and gains.
      Provide the response in a structured JSON format with no additional text. The response should contain 'debitAccount', 'debitType', 'debitRule', 'creditAccount', 'creditType', 'creditRule', and 'amount'.`;

      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema
        }
      };

      const result = await callGeminiAPI(payload, "gemini-2.5-flash-preview-05-20");
      const jsonString = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!jsonString) {
        throw new Error("Could not retrieve a valid response from the AI.");
      }
      
      const entry = parseJsonSafely(jsonString);
      setJournalEntry(entry);
      showMessage("Journal entry generated successfully!", 'success');

    } catch (error) {
      console.error('Error:', error);
      showMessage(`An error occurred: ${error.message}`, 'error');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [transactionDescription, responseSchema]);

  const handleSuggestTransaction = useCallback(async () => {
    dispatch({ type: 'SET_SUGGESTING', payload: true });
    setMessage({ text: '', type: '' });
    
    try {
      const prompt = `Generate a realistic but simple accounting transaction for a small business or individual, suitable for a beginner's journal entry practice. The transaction should have a clear debit and credit account and a reasonable monetary amount. For example, 'Paid rent of ₹500 in cash.' Provide only the text of the transaction with no extra formatting.`;
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

      const result = await callGeminiAPI(payload, "gemini-2.5-flash-preview-05-20");
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        setTransactionDescription(text.replace(/\*\*/g, ''));
        showMessage("Transaction suggestion ready!", 'success');
      } else {
        throw new Error("Failed to suggest a transaction.");
      }
    } catch (error) {
      console.error('Error suggesting transaction:', error);
      showMessage(`An error occurred: ${error.message}`, 'error');
    } finally {
      dispatch({ type: 'SET_SUGGESTING', payload: false });
    }
  }, []);

  const handleExplainEntry = useCallback(async () => {
    if (!journalEntry) {
      showMessage("Please generate a journal entry first.", 'error');
      return;
    }
    dispatch({ type: 'SET_EXPLAINING', payload: true });
    setExplanationText('');
    setMessage({ text: '', type: '' });

    try {
      const prompt = `Using the following journal entry, provide a simple, friendly, and conversational explanation of why the debit and credit accounts were chosen based on the Golden Rules of Accounting. Use an encouraging tone as if you are a tutor.
      Journal Entry Details:
      Debit Account: ${journalEntry.debitAccount} (Type: ${journalEntry.debitType}, Rule: ${journalEntry.debitRule})
      Credit Account: ${journalEntry.creditAccount} (Type: ${journalEntry.creditType}, Rule: ${journalEntry.creditRule})
      Transaction: ${transactionDescription}
      Please provide only the explanation text, formatted in paragraphs.`;

      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
      const result = await callGeminiAPI(payload, "gemini-2.5-flash-preview-05-20");
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        setExplanationText(text);
        showMessage("Explanation ready!", 'success');
      } else {
        throw new Error("Failed to get an explanation from the AI.");
      }
    } catch (error) {
      console.error('Error explaining entry:', error);
      showMessage(`An error occurred: ${error.message}`, 'error');
    } finally {
      dispatch({ type: 'SET_EXPLAINING', payload: false });
    }
  }, [journalEntry, transactionDescription]);

  const handleReadEntry = useCallback(async () => {
    if (!journalEntry) {
      showMessage("Please generate a journal entry first.", 'error');
      return;
    }
    dispatch({ type: 'SET_READING', payload: true });
    setMessage({ text: '', type: '' });

    try {
      const textToSpeak = `For the transaction: ${transactionDescription}, the journal entry is as follows: Debit ${journalEntry.debitAccount} for ${journalEntry.amount} rupees, and Credit ${journalEntry.creditAccount} for ${journalEntry.amount} rupees.`;

      const payload = {
        contents: [{ parts: [{ text: textToSpeak }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
          }
        },
        model: "gemini-2.5-flash-preview-tts"
      };

      const result = await callGeminiAPI(payload, "gemini-2.5-flash-preview-tts");
      const audioPart = result?.candidates?.[0]?.content?.parts?.[0];
      if (audioPart) {
        const audioData = audioPart.inlineData.data;
        const mimeType = audioPart.inlineData.mimeType;
        const sampleRateMatch = mimeType.match(/rate=(\d+)/);
        if (!sampleRateMatch) throw new Error("Could not determine sample rate from MIME type.");
        const sampleRate = parseInt(sampleRateMatch[1], 10);
        const pcmData = base64ToArrayBuffer(audioData);
        const pcm16 = new Int16Array(pcmData);
        const wavBlob = pcmToWav(pcm16, sampleRate);
        const audioUrl = URL.createObjectURL(wavBlob);
        audioRef.current.src = audioUrl;
        audioRef.current.play().catch(e => {
          console.error("Audio playback failed:", e);
          showMessage("Audio playback failed. The browser may require a user gesture to play media.", 'error');
        });
        showMessage("Audio playback ready!", 'success');
      } else {
        throw new Error("Failed to generate audio from the AI.");
      }
    } catch (error) {
      console.error('Error with audio generation:', error);
      showMessage(`An error occurred with audio: ${error.message}`, 'error');
    } finally {
      dispatch({ type: 'SET_READING', payload: false });
    }
  }, [journalEntry, transactionDescription]);

  // Event handler for Financial Analyzer
  const handleAnalyzeData = useCallback(async () => {
    if (!financialData.trim()) {
      showMessage("Please paste some financial data to analyze.", 'error');
      return;
    }
    dispatch({ type: 'SET_ANALYZING', payload: true });
    setFinancialAnalysis(null);
    setMessage({ text: '', type: '' });

    try {
      const prompt = `Act as a senior financial analyst. Analyze the following financial data and provide a concise, easy-to-understand summary. Your response must identify key financial trends, calculate total income and total expenses, determine the net profit, and provide a short, actionable suggestion for financial health.
      Financial Data:
      ${financialData}
      Please provide your analysis in a structured JSON format with no additional text or conversational filler.`;

      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: analysisSchema
        }
      };

      const result = await callGeminiAPI(payload, "gemini-2.5-flash-preview-05-20");
      const jsonString = result?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!jsonString) {
        throw new Error("Could not retrieve a valid analysis response from the AI.");
      }

      const analysis = parseJsonSafely(jsonString);
      setFinancialAnalysis(analysis);
      showMessage("Financial analysis complete!", 'success');

    } catch (error) {
      console.error('Error analyzing financial data:', error);
      showMessage(`An error occurred during analysis: ${error.message}`, 'error');
    } finally {
      dispatch({ type: 'SET_ANALYZING', payload: false });
    }
  }, [financialData, analysisSchema]);

  // Function for suggesting financial data
  const handleSuggestFinancialData = useCallback(async () => {
    dispatch({ type: 'SET_SUGGESTING_ANALYZER', payload: true });
    setMessage({ text: '', type: '' });
    
    try {
      const prompt = `Generate a realistic list of 5-7 income and expense transactions for a small business over a month. Each item should be on a new line and include a category and amount, like "Income: Sales, ₹5000" or "Expense: Rent, ₹50". Please provide only the list with no additional text or formatting.`;
      const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

      const result = await callGeminiAPI(payload, "gemini-2.5-flash-preview-05-20");
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        setFinancialData(text);
        showMessage("Sample financial data ready!", 'success');
      } else {
        throw new Error("Failed to suggest financial data.");
      }
    } catch (error) {
      console.error('Error suggesting financial data:', error);
      showMessage(`An error occurred: ${error.message}`, 'error');
    } finally {
      dispatch({ type: 'SET_SUGGESTING_ANALYZER', payload: false });
    }
  }, []);

  // Memoize chart data to prevent unnecessary re-renders
  const chartData = useMemo(() => {
    return financialAnalysis ? [
      { name: 'Income', value: financialAnalysis.income, fill: isDarkMode ? 'url(#incomeGradientVibrant)' : 'url(#incomeGradientVibrantLight)' },
      { name: 'Expenses', value: financialAnalysis.expenses, fill: isDarkMode ? 'url(#expensesGradientVibrant)' : 'url(#expensesGradientVibrantLight)' },
      { name: 'Net Profit', value: financialAnalysis.netProfit, fill: isDarkMode ? 'url(#profitGradientVibrant)' : 'url(#profitGradientVibrantLight)' },
    ] : [];
  }, [financialAnalysis, isDarkMode]);

  const allButtonsDisabled = state.isLoading || state.isSuggesting || state.isExplaining || state.isReading || state.isAnalyzing || state.isSuggestingAnalyzer;

  const AnimatedCounter = ({ from, to }) => {
    const [count, setCount] = useState(from);
    useEffect(() => {
      const duration = 1500; // 1.5 seconds for the animation
      const start = performance.now();
      const animate = (time) => {
        const elapsed = time - start;
        const progress = Math.min(elapsed / duration, 1);
        const value = from + (to - from) * progress;
        setCount(value);
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }, [to, from]);

    return (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.5 }}
      >
        ₹{Math.round(count).toLocaleString()}
      </motion.span>
    );
  };

  return (
    <div className={`${isDarkMode ? 'bg-slate-950 text-slate-300' : 'bg-gray-100 text-slate-900'} min-h-screen flex items-center justify-center p-4 sm:p-8 font-sans transition-colors duration-500`}>
      <motion.div
        className={`w-full max-w-4xl p-6 md:p-8 rounded-3xl backdrop-blur-sm shadow-2xl flex flex-col gap-8 md:gap-10 relative ${isDarkMode ? 'bg-white/5 border border-purple-700' : 'bg-white/80 border border-purple-400'}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1, transition: { duration: 0.5 } }}
      >
        {/* Top-right button container */}
        <div className="absolute top-4 right-4 flex space-x-2">
          {/* Reset Button */}
          <button
            onClick={handleReset}
            className={`p-2 rounded-full transition-all duration-300 ${isDarkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
            aria-label="Reset application"
            title="Reset"
          >
            <RotateCcw size={20} />
          </button>
          
          {/* Theme Toggle Button */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2 rounded-full transition-all duration-300 ${isDarkMode ? 'bg-gray-700 text-yellow-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>

        {/* Title with professional icon */}
        <style jsx>{`
          @keyframes wave-animation {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animate-color-wave {
            background-image: linear-gradient(90deg, #4F46E5, #9333EA, #EC4899, #F97316, #EAB308, #10B981, #3B82F6);
            background-size: 400% 400%;
            animation: wave-animation 10s ease-in-out infinite;
          }
        `}</style>
        <div className="flex justify-center items-center gap-4">
          <motion.div
            className="flex-shrink-0"
            whileHover={{ rotate: 360, scale: 1.1 }}
            transition={{ duration: 0.8 }}
          >
            <HandCoins size={40} className="text-purple-500" />
          </motion.div>
          <motion.h1 className="text-3xl sm:text-4xl font-extrabold text-center tracking-wide bg-clip-text text-transparent animate-color-wave">
            Fin Genius
          </motion.h1>
        </div>
        
        {/* Journal Entry Generator Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col gap-6">
            <motion.div className="flex justify-center items-center gap-2"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
              <motion.div
                whileHover={{ rotate: 10, scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.3 }}
              >
                <BookText size={32} className="text-teal-500" />
              </motion.div>
              <h2 className="text-2xl font-semibold text-center bg-clip-text bg-gradient-to-r from-teal-400 to-green-500">
                Ledger & Journal Assistant (AI)
              </h2>
            </motion.div>
            <p className={`${isDarkMode ? 'text-slate-400' : 'text-slate-600'} text-center`}>Input a transaction to see the corresponding journal entry based on the Golden Rules.</p>
            <form onSubmit={handleGenerateEntry} className="space-y-6">
              <div>
                <label htmlFor="description" className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Transaction Description</label>
                <input
                  type="text"
                  id="description"
                  placeholder="e.g., Paid salary of ₹1000 in cash"
                  value={transactionDescription}
                  onChange={(e) => setTransactionDescription(e.target.value)}
                  required
                  className={`w-full px-4 py-3 border rounded-xl placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                  disabled={allButtonsDisabled}
                />
              </div>
              <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                <motion.button
                  type="submit"
                  disabled={allButtonsDisabled}
                  className={`flex-1 py-3 px-4 text-white font-medium rounded-xl shadow-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-slate-950 flex justify-center items-center gap-2 ${
                    allButtonsDisabled ? (isDarkMode ? 'bg-slate-700 cursor-not-allowed' : 'bg-slate-300 text-slate-500 cursor-not-allowed') : (isDarkMode ? 'bg-gradient-to-br from-indigo-600 to-purple-800 hover:from-indigo-700 hover:to-purple-900 focus:ring-indigo-600' : 'bg-gradient-to-br from-indigo-700 to-purple-900 hover:from-indigo-800 hover:to-purple-950 focus:ring-indigo-700')
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {state.isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="opacity-75">Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <BarChart2 size={20} /> Generate
                    </>
                  )}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={handleSuggestTransaction}
                  disabled={allButtonsDisabled}
                  className={`flex-1 py-3 px-4 font-medium rounded-xl shadow-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-2 flex justify-center items-center gap-2 ${
                    allButtonsDisabled ? (isDarkMode ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-slate-300 text-slate-500 cursor-not-allowed') : (isDarkMode ? 'bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 focus:ring-slate-700 text-white' : 'bg-gradient-to-br from-gray-300 to-gray-400 hover:from-gray-400 hover:to-gray-500 focus:ring-gray-300 text-slate-800')
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {state.isSuggesting ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="opacity-75">Suggesting...</span>
                    </>
                  ) : (
                    <>
                      <Lightbulb size={20} className={isDarkMode ? 'text-white' : 'text-slate-800'} /> <span className={isDarkMode ? 'text-white' : 'text-slate-800'}>Suggest</span>
                    </>
                  )}
                </motion.button>
              </div>
            </form>
            <AnimatePresence>
              {message.text && (
                <motion.div
                  key="message"
                  className={`mt-4 p-4 rounded-lg text-sm font-medium flex items-center gap-2 ${message.type === 'error' ? 'bg-red-400 text-red-950' : 'bg-green-400 text-green-950'}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  {message.type === 'error' ? <CircleAlert size={20} /> : <CircleCheck size={20} />}
                  {message.text}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className={`p-6 rounded-2xl shadow-inner flex flex-col justify-between ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-200 border-slate-300'}`}>
            <div>
              <h2 className="text-2xl font-semibold text-center mb-4 bg-clip-text bg-gradient-to-r from-teal-400 to-green-500">
                The Golden Rules
              </h2>
              <div className="mb-6 space-y-4">
                <motion.div
                  className={`p-4 rounded-xl shadow-md border ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-300'}`}
                  whileHover={{ scale: 1.02 }}
                >
                  <h3 className={`font-bold text-lg mb-1 flex items-center gap-2 ${isDarkMode ? 'text-teal-400' : 'text-teal-600'}`}><HandCoins size={20} /> Personal Account</h3>
                  <p className="text-sm">
                    <span className={`font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Debit</span> the Receiver, <span className={`font-semibold ${isDarkMode ? 'text-fuchsia-400' : 'text-fuchsia-600'}`}>Credit</span> the Giver.
                  </p>
                </motion.div>
                <motion.div
                  className={`p-4 rounded-xl shadow-md border ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-300'}`}
                  whileHover={{ scale: 1.02 }}
                >
                  <h3 className={`font-bold text-lg mb-1 flex items-center gap-2 ${isDarkMode ? 'text-teal-400' : 'text-teal-600'}`}><PiggyBank size={20} /> Real Account</h3>
                  <p className="text-sm">
                    <span className={`font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Debit</span> what comes in, <span className={`font-semibold ${isDarkMode ? 'text-fuchsia-400' : 'text-fuchsia-600'}`}>Credit</span> what goes out.
                  </p>
                </motion.div>
                <motion.div
                  className={`p-4 rounded-xl shadow-md border ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-300'}`}
                  whileHover={{ scale: 1.02 }}
                >
                  <h3 className={`font-bold text-lg mb-1 flex items-center gap-2 ${isDarkMode ? 'text-teal-400' : 'text-teal-600'}`}><Coins size={20} /> Nominal Account</h3>
                  <p className="text-sm">
                    <span className={`font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>Debit</span> all expenses and losses, <span className={`font-semibold ${isDarkMode ? 'text-fuchsia-400' : 'text-fuchsia-600'}`}>Credit</span> all incomes and gains.
                  </p>
                </motion.div>
              </div>
            </div>
            
            <div className={`mt-8 pt-6 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-300'}`}>
              <h2 className={`text-2xl font-semibold text-center mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Your Journal Entry</h2>
              <AnimatePresence mode="wait">
                {journalEntry && (
                  <motion.div
                    key="journalReport"
                    className={`p-6 rounded-xl space-y-4 shadow-lg relative overflow-hidden ${isDarkMode ? 'bg-slate-900 border border-slate-700 text-slate-200' : 'bg-white border border-gray-300 text-slate-800'}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    {/* Animated background glow */}
                    <motion.div
                      className="absolute inset-0 z-0 rounded-xl bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-500/20 via-purple-500/20 to-pink-500/20"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: 1.5 } }}
                    />
                    
                    <div className="relative z-10 space-y-4">
                      <p className={`font-bold text-center ${isDarkMode ? 'text-teal-300' : 'text-teal-600'}`}>Transaction: {transactionDescription}</p>
                      
                      <div className={`p-4 rounded-xl shadow-inner ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                        <motion.div
                          className="flex justify-between items-center mb-2"
                          initial="hidden"
                          animate="visible"
                          variants={typingVariants}
                        >
                          <motion.span className="font-bold">
                            {journalEntry.debitAccount} A/C
                          </motion.span>
                          <motion.span className={`font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                            Dr. <AnimatedCounter from={0} to={journalEntry.amount} />
                          </motion.span>
                        </motion.div>
                        
                        <motion.div
                          className="flex justify-between items-center pl-8"
                          initial="hidden"
                          animate="visible"
                          variants={typingVariants}
                          transition={{ delay: 0.5 }}
                        >
                          <motion.span className="font-bold">
                            To {journalEntry.creditAccount} A/C
                          </motion.span>
                          <motion.span className={`font-bold ${isDarkMode ? 'text-fuchsia-400' : 'text-fuchsia-600'}`}>
                            Cr. <AnimatedCounter from={0} to={journalEntry.amount} />
                          </motion.span>
                        </motion.div>
                      </div>
                      
                      <div className={`p-4 rounded-lg text-sm space-y-2 ${isDarkMode ? 'bg-slate-700 text-white' : 'bg-gray-300 text-slate-800'}`}>
                        <p className={`font-medium flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}><Sparkles size={16} className={`${isDarkMode ? 'text-yellow-300' : 'text-yellow-600'}`} />Explanation based on Golden Rules:</p>
                        <p>Since <b>{journalEntry.debitAccount}</b> is a <b>{journalEntry.debitType} Account</b>, we follow the rule: <span className={`font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{journalEntry.debitRule}</span>.</p>
                        <p>Since <b>{journalEntry.creditAccount}</b> is a <b>{journalEntry.creditType} Account</b>, we follow the rule: <span className={`font-semibold ${isDarkMode ? 'text-fuchsia-400' : 'text-fuchsia-600'}`}>{journalEntry.creditRule}</span>.</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {journalEntry && (
                <div className="mt-4 space-y-2">
                  <motion.button
                    onClick={handleExplainEntry}
                    disabled={allButtonsDisabled}
                    className={`w-full py-3 px-4 font-medium rounded-xl shadow-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-2 flex justify-center items-center gap-2 ${
                      allButtonsDisabled ? (isDarkMode ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-slate-300 text-slate-500 cursor-not-allowed') : (isDarkMode ? 'bg-gradient-to-br from-teal-600 to-cyan-800 hover:from-teal-700 hover:to-cyan-900 focus:ring-teal-600 text-white' : 'bg-gradient-to-br from-teal-700 to-cyan-900 hover:from-teal-800 hover:to-cyan-950 focus:ring-teal-700 text-white')
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {state.isExplaining ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="opacity-75">Explaining...</span>
                      </>
                    ) : (
                      <>
                        <Megaphone size={20} /> Explain the Entry
                      </>
                    )}
                  </motion.button>
                  <AnimatePresence>
                    {explanationText && (
                      <motion.div
                        key="explanation"
                        className={`mt-4 p-4 rounded-xl shadow-inner text-sm ${isDarkMode ? 'bg-slate-900 text-slate-200' : 'bg-white text-slate-800'}`}
                        dangerouslySetInnerHTML={{ __html: explanationText }}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      />
                    )}
                  </AnimatePresence>
                  <motion.button
                    onClick={handleReadEntry}
                    disabled={allButtonsDisabled}
                    className={`w-full py-3 px-4 font-medium rounded-xl shadow-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-2 flex justify-center items-center gap-2 ${
                      allButtonsDisabled ? (isDarkMode ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-slate-300 text-slate-500 cursor-not-allowed') : (isDarkMode ? 'bg-gradient-to-br from-green-600 to-cyan-800 hover:from-green-700 hover:to-cyan-900 focus:ring-green-600 text-white' : 'bg-gradient-to-br from-green-700 to-cyan-900 hover:from-green-800 hover:to-cyan-950 focus:ring-green-700 text-white')
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {state.isReading ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="opacity-75">Reading...</span>
                      </>
                    ) : (
                      <>
                        <PlayCircle size={20} /> Read Journal Entry
                      </>
                    )}
                  </motion.button>
                  <audio ref={audioRef} className="hidden" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Financial Analyzer Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10 pt-10 border-t border-slate-700">
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-semibold text-center bg-clip-text bg-gradient-to-r from-teal-400 to-green-500">Financial Analyzer</h2>
            <p className="text-center text-slate-400">Paste a list of transactions or financial data to get a high-level analysis.</p>
            <div className="space-y-6">
              <div>
                <label htmlFor="financial-data" className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Financial Data (Paste here)</label>
                <textarea
                  id="financial-data"
                  rows="10"
                  placeholder="e.g.,
                  Income: Sales, ₹5000
                  Expense: Rent, ₹1500
                  Income: Consulting Fee, ₹2500"
                  value={financialData}
                  onChange={(e) => setFinancialData(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}`}
                  disabled={allButtonsDisabled}
                />
              </div>
              <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                <motion.button
                  onClick={handleAnalyzeData}
                  disabled={allButtonsDisabled}
                  className={`flex-1 py-3 px-4 text-white font-medium rounded-xl shadow-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-offset-slate-950 flex justify-center items-center gap-2 ${
                    allButtonsDisabled ? (isDarkMode ? 'bg-slate-700 cursor-not-allowed' : 'bg-slate-300 text-slate-500 cursor-not-allowed') : (isDarkMode ? 'bg-gradient-to-br from-indigo-600 to-purple-800 hover:from-indigo-700 hover:to-purple-900 focus:ring-indigo-600' : 'bg-gradient-to-br from-indigo-700 to-purple-900 hover:from-indigo-800 hover:to-purple-950 focus:ring-indigo-700')
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {state.isAnalyzing ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="opacity-75">Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp size={20} /> Analyze Data
                    </>
                  )}
                </motion.button>
                <motion.button
                  onClick={handleSuggestFinancialData}
                  disabled={allButtonsDisabled}
                  className={`flex-1 py-3 px-4 font-medium rounded-xl shadow-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-offset-2 flex justify-center items-center gap-2 ${
                    allButtonsDisabled ? (isDarkMode ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-slate-300 text-slate-500 cursor-not-allowed') : (isDarkMode ? 'bg-gradient-to-br from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 focus:ring-slate-700 text-white' : 'bg-gradient-to-br from-gray-300 to-gray-400 hover:from-gray-400 hover:to-gray-500 focus:ring-gray-300 text-slate-800')
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {state.isSuggestingAnalyzer ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="opacity-75">Suggesting...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} className={isDarkMode ? 'text-white' : 'text-slate-800'} /> <span className={isDarkMode ? 'text-white' : 'text-slate-800'}>Suggest Data</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </div>
          <div className={`p-6 rounded-2xl shadow-inner flex flex-col justify-between ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-200 border-slate-300'}`}>
            <h2 className="text-2xl font-semibold mb-4 text-center bg-clip-text bg-gradient-to-r from-teal-400 to-green-500">
              Analysis Report
            </h2>
            <AnimatePresence mode="wait">
              {financialAnalysis && (
                <motion.div
                  key="financialReport"
                  className={`p-6 rounded-xl space-y-4 shadow-lg ${isDarkMode ? 'bg-slate-900 border border-slate-700 text-slate-200' : 'bg-white border border-gray-300 text-slate-800'}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <svg width="0" height="0">
                    <defs>
                      <linearGradient id="incomeGradientVibrant" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={1}/>
                        <stop offset="95%" stopColor="#34D399" stopOpacity={0.8}/>
                      </linearGradient>
                      <linearGradient id="expensesGradientVibrant" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={1}/>
                        <stop offset="95%" stopColor="#F87171" stopOpacity={0.8}/>
                      </linearGradient>
                      <linearGradient id="profitGradientVibrant" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={1}/>
                        <stop offset="95%" stopColor="#60A5FA" stopOpacity={0.8}/>
                      </linearGradient>
                      <linearGradient id="incomeGradientVibrantLight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#047857" stopOpacity={1}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.8}/>
                      </linearGradient>
                      <linearGradient id="expensesGradientVibrantLight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#B91C1C" stopOpacity={1}/>
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0.8}/>
                      </linearGradient>
                      <linearGradient id="profitGradientVibrantLight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={1}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.8}/>
                      </linearGradient>
                    </defs>
                  </svg>
                  <motion.div
                    className={`w-full h-64 rounded-xl p-2 shadow-inner relative overflow-hidden ${isDarkMode ? 'bg-slate-950/50' : 'bg-white/50'}`}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" stroke={isDarkMode ? '#6b7280' : '#475569'} />
                        <YAxis stroke={isDarkMode ? '#6b7280' : '#475569'} />
                        <Tooltip
                          cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
                          labelFormatter={(name) => `Value: ₹${chartData.find(d => d.name === name)?.value.toLocaleString()}`}
                          formatter={(value) => `₹${value.toLocaleString()}`}
                          contentStyle={{ background: isDarkMode ? '#1e293b' : '#f1f5f9', border: isDarkMode ? '1px solid #475569' : '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', color: isDarkMode ? '#fff' : '#0f172a' }}
                          itemStyle={{ color: isDarkMode ? '#fff' : '#0f172a' }}
                        />
                        <Bar dataKey="value" barSize={30} radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </motion.div>
                  
                  <motion.div variants={containerVariants} initial="hidden" animate="show">
                    <motion.div variants={itemVariants}>
                      <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-teal-400' : 'text-teal-600'}`}>Summary</h3>
                      <p className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{financialAnalysis.summary}</p>
                    </motion.div>

                    <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <motion.div
                        className={`p-4 rounded-lg shadow-inner relative overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}
                        whileHover={{ scale: 1.05 }}
                      >
                        <motion.div
                          className={`absolute inset-0 z-0 bg-gradient-to-br rounded-lg ${isDarkMode ? 'from-green-500/20 to-lime-500/10' : 'from-green-600/30 to-lime-600/20'}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1, transition: { duration: 1, delay: 0.5 } }}
                        />
                        <h4 className={`font-bold relative z-10 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Total Income</h4>
                        <p className={`text-xl font-semibold relative z-10 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                          <AnimatedCounter from={0} to={financialAnalysis.income} />
                        </p>
                      </motion.div>
                      <motion.div
                        className={`p-4 rounded-lg shadow-inner relative overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}
                        whileHover={{ scale: 1.05 }}
                      >
                        <motion.div
                          className={`absolute inset-0 z-0 bg-gradient-to-br rounded-lg ${isDarkMode ? 'from-red-500/20 to-rose-500/10' : 'from-red-600/30 to-rose-600/20'}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1, transition: { duration: 1, delay: 0.7 } }}
                        />
                        <h4 className={`font-bold relative z-10 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Total Expenses</h4>
                        <p className={`text-xl font-semibold relative z-10 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                          <AnimatedCounter from={0} to={financialAnalysis.expenses} />
                        </p>
                      </motion.div>
                      <motion.div
                        className={`col-span-1 sm:col-span-2 p-4 rounded-lg shadow-inner relative overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}
                        whileHover={{ scale: 1.05 }}
                      >
                        <motion.div
                          className={`absolute inset-0 z-0 rounded-lg ${financialAnalysis.netProfit >= 0 ? (isDarkMode ? 'bg-blue-500/20' : 'bg-blue-600/30') : (isDarkMode ? 'bg-red-500/20' : 'bg-red-600/30')}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1, transition: { duration: 1, delay: 0.9 } }}
                        />
                        <h4 className={`font-bold relative z-10 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Net Profit</h4>
                        <p className={`text-2xl font-bold relative z-10 ${financialAnalysis.netProfit >= 0 ? (isDarkMode ? 'text-green-400' : 'text-green-600') : (isDarkMode ? 'text-red-400' : 'text-red-600')}`}>
                          <AnimatedCounter from={0} to={financialAnalysis.netProfit} />
                        </p>
                      </motion.div>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                      <h3 className={`text-xl font-bold mt-4 mb-2 ${isDarkMode ? 'text-teal-400' : 'text-teal-600'}`}>Key Trends</h3>
                      <motion.ul variants={containerVariants} className={`list-disc list-inside space-y-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {financialAnalysis.trends.map((trend, index) => (
                          <motion.li key={index} variants={itemVariants} className="flex items-start gap-2">
                            <Gauge size={18} className="text-blue-500 shrink-0" />
                            <span>{trend}</span>
                          </motion.li>
                        ))}
                      </motion.ul>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                      <h3 className={`text-xl font-bold mt-4 mb-2 ${isDarkMode ? 'text-teal-400' : 'text-teal-600'}`}>Suggestions</h3>
                      <p className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{financialAnalysis.suggestions}</p>
                    </motion.div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default App;
