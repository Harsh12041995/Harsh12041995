import axios from 'axios';

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  execute: (args: any) => Promise<string>;
}

export const toolRegistry: Record<string, Tool> = {
  get_weather: {
    name: 'get_weather',
    description: 'Get the current weather for a specific city or coordinates.',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name (e.g. London, Tokyo)' },
        lat: { type: 'number' },
        lon: { type: 'number' }
      },
      required: ['location']
    },
    async execute({ location, lat, lon }) {
      try {
        let finalLat = lat;
        let finalLon = lon;

        if (!lat || !lon) {
          // Simple geocoding fallback or default to a major city if search fails
          const geo = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
          if (geo.data.results?.[0]) {
            finalLat = geo.data.results[0].latitude;
            finalLon = geo.data.results[0].longitude;
          } else {
            return `Could not find coordinates for ${location}.`;
          }
        }

        const res = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${finalLat}&longitude=${finalLon}&current_weather=true`);
        const { temperature, windspeed, weathercode } = res.data.current_weather;
        return `Current weather in ${location}: ${temperature}°C, Wind Speed: ${windspeed}km/h. (Code: ${weathercode})`;
      } catch (err) {
        return `Error fetching weather: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }
    }
  },

  wikipedia_search: {
    name: 'wikipedia_search',
    description: 'Search Wikipedia for information about a topic, person, or place.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The topic to search for' }
      },
      required: ['query']
    },
    async execute({ query }) {
      try {
        const res = await axios.get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`);
        const results = res.data.query.search;
        if (!results || results.length === 0) return `No Wikipedia results found for "${query}".`;
        
        // Get the first result's snippet
        const first = results[0];
        const snippet = first.snippet.replace(/<[^>]*>/g, ''); // Remove HTML tags
        return `Wikipedia Summary for "${first.title}": ${snippet}... (Source: https://en.wikipedia.org/wiki/${encodeURIComponent(first.title)})`;
      } catch (err) {
        return `Error searching Wikipedia: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }
    }
  },

  calculate: {
    name: 'calculate',
    description: 'Perform a mathematical calculation.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'The math expression to evaluate (e.g. "1.15 * 1250")' }
      },
      required: ['expression']
    },
    async execute({ expression }) {
      try {
        // Basic safety check: only allow numbers, operators, and parentheses
        if (/[^0-9+\-*/().\s%]/.test(expression)) {
          return "Invalid characters in expression. Use only numbers and basic operators (+, -, *, /, %, ()).";
        }
        
        // Handle percentages (e.g. 15% -> 0.15)
        const sanitized = expression.replace(/([0-9.]+)%/g, '($1/100)');
        
        // Use Function instead of eval for a slightly safer environment
        const result = new Function(`return ${sanitized}`)();
        return `Result: ${result}`;
      } catch (err) {
        return `Math error: ${err instanceof Error ? err.message : 'Invalid expression'}`;
      }
    }
  },

  dictionary_lookup: {
    name: 'dictionary_lookup',
    description: 'Look up the definition of a word.',
    parameters: {
      type: 'object',
      properties: {
        word: { type: 'string', description: 'The word to define' }
      },
      required: ['word']
    },
    async execute({ word }) {
      try {
        const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        const entry = res.data[0];
        const definition = entry.meanings[0].definitions[0].definition;
        return `Definition of "${word}": ${definition}`;
      } catch (err) {
        return `Word not found or error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }
    }
  },

  get_time: {
    name: 'get_time',
    description: 'Get the current time and date.',
    parameters: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: 'Optional timezone (e.g. "America/New_York")' }
      },
      required: []
    },
    async execute({ timezone }) {
      try {
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = { 
          timeZone: timezone || undefined,
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        };
        return `Current time: ${now.toLocaleString('en-US', options)}`;
      } catch (err) {
        return `Error getting time: ${err instanceof Error ? err.message : 'Invalid timezone'}`;
      }
    }
  },

  google_search: {
    name: 'google_search',
    description: 'Search the web for real-time information, news, or specific facts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    },
    async execute({ query, apiKey }) {
      if (!apiKey) return "Google Search requires an API key in settings.";
      try {
        const res = await axios.post('https://google.serper.dev/search', { q: query }, {
          headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }
        });
        const results = res.data.organic?.slice(0, 3) || [];
        if (results.length === 0) return `No search results found for "${query}".`;
        return results.map((r: any) => `${r.title}: ${r.snippet} (Source: ${r.link})`).join('\n\n');
      } catch (err) {
        return `Search error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }
    }
  },

  get_news: {
    name: 'get_news',
    description: 'Get the latest news headlines.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'News category (general, business, technology, sports, etc.)' }
      },
      required: []
    },
    async execute({ category, apiKey }) {
      if (!apiKey) return "News search requires an API key in settings.";
      try {
        const res = await axios.get(`https://newsapi.org/v2/top-headlines?category=${category || 'general'}&language=en&apiKey=${apiKey}`);
        const articles = res.data.articles?.slice(0, 3) || [];
        if (articles.length === 0) return `No news found for category "${category || 'general'}".`;
        return articles.map((a: any) => `* ${a.title} - ${a.description} (Source: ${a.url})`).join('\n');
      } catch (err) {
        return `News error: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }
    }
  }
};

/**
 * Optimized Tool Router
 * Categorizes the message and decides whether to bypass the LLM (Regex) 
 * or let the LLM decide (LLM Tool Calling).
 */
export class ToolRouter {
  /** 
   * Tier 1: Regex Routing (0 GPU)
   * Returns a promise if a match is found, null otherwise.
   */
  async routeByRegex(message: string): Promise<string | null> {
    const msg = message.toLowerCase().trim();

    // 1. Time / Date (Must be a question or a command, not just "current time" which is our output)
    if (/^(what time is it\??|what's the time\??|what is the date\??|today's date\??|what day is it\??)$/i.test(msg) || 
        msg === 'time' || msg === 'date') {
      return await toolRegistry.get_time.execute({});
    }

    // 2. Simple Math (e.g. "5 + 5", "15% of 200")
    // Ensure it's a pure math expression and not a wordy sentence that happens to have numbers
    if (/^[0-9\s+\-*/().%]+$/.test(msg) || (msg.includes('% of') && /^[0-9.\s% of]+$/.test(msg))) {
      let expression = msg.replace(' of ', '*');
      if (expression.includes('?') ) expression = expression.replace('?', '');
      return await toolRegistry.calculate.execute({ expression });
    }

    return null;
  }
}
