export const movieRecommendationSchema = {
  name: "movie_recommendations_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      recommendations: {
        type: "array",
        description: "A list of movie recommendations based on user preferences.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The title of the movie."
            },
            releaseYear: {
              type: "string",
              description: "The year the movie was released."
            },
            content: {
              type: "string",
              description: "A brief summary and details of the movie, including runtime, genre, director, stars, and IMDB rating."
            }
          },
          required: ["title", "releaseYear", "content"],
          additionalProperties: false
        }
      }
    },
    required: ["recommendations"],
    additionalProperties: false
  }
};