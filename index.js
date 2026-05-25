import { openai, supabase } from './config.js';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const form = document.getElementById('movie-form');

const movies = await fetch('./movies.txt')
const text = await movies.text()

form.addEventListener('submit', (e) => {
    e.preventDefault(); // Prevents the page from reloading on submit

    const favoriteMovie = document.getElementById('favorite-movie').value;
    const mood = document.getElementById('mood').value;
    const favoriteGenre = document.getElementById('favorite-genre').value;

    console.log({ favoriteMovie, mood, favoriteGenre });
    const userInput = `My favorite movie is ${favoriteMovie}. My current mood is ${mood}. My favorite genre is ${favoriteGenre}.`;

    // Call the function to get movie recommendations based on user input
    // getMovieRecommendations(userInput);
});

// Create an embedding vector representing the input text
async function createEmbedding(input) {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input
    });
    return embeddingResponse.data[0].embedding;
  } catch (error) {
    console.error('Error creating embedding:', error);
    throw error; // Rethrow to prevent proceeding with an undefined embedding
  }
}

// Query Supabase and return a semantically matching text chunk
async function findNearestMatch(embedding) {
  try {
    const { data, error } = await supabase.rpc('match_movies', {
      query_embedding: embedding,
      match_threshold: 0.50,
      match_count: 3
    });
    
    if (error) throw error;
    
    // Gracefully handle the scenario where no results meet the match_threshold
    if (!data || data.length === 0) return null;
    const topMatch = data.map(match => match.content).join('\n');
    console.log('Top matches from Supabase:', topMatch);
    // Best Practice: Combine top matches to provide comprehensive context
    return topMatch;
  } catch (error) {
    console.error('Error finding nearest match:', error);
    return null;
  }
}

// Use OpenAI to make the response conversational
async function getChatCompletion(text, query) {
  // Build messages array locally to avoid mutating global state across multiple calls
  const chatMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Context: ${text}\nQuestion: ${query}` }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: chatMessages,
      temperature: 0.5,
      frequency_penalty: 0.5,
      top_p: 0.9,
    });
  
    console.log(response.choices[0].message.content);

  } catch (error) {
    console.error('Error getting chat completion:', error);
  }
  
}


async function splitDocument(document) {
  // Create a text splitter
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 120,
    chunkOverlap: 10,
  });
  try {
    // Split the text
    const texts = await splitter.createDocuments([document]);
    return texts;
  } catch (error) {
    console.error('Error splitting document:', error);
  }
}

/* Create an embedding from each text chunk.
Store all embeddings and corresponding text in Supabase. */
async function createAndStoreEmbeddings() {
  try{
    const chunkData = await splitDocument(text);
    const data = await Promise.all(
      chunkData.map( async (textChunk) => {
  // DRY: Reuse the createEmbedding function instead of duplicating the API call
          const embedding = await createEmbedding(textChunk.pageContent);
          return { 
            content: textChunk.pageContent, 
            embedding 
          }
      })
    );
    
    // Insert content and embedding into Supabase
    const { error } = await supabase.from('movies').insert(data);
    if (error) {
      console.error('Error inserting data into Supabase:', error);
    } else {
      console.log('Embedding and storing complete!');
    }
  } catch (error) {
    console.error('Error creating and storing embeddings:', error);
  }

}

createAndStoreEmbeddings()
