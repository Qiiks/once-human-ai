const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testApiKey() {
    const apiKey = process.env.TEST_API_KEY;

    if (!apiKey) {
        console.error('Error: Please set the TEST_API_KEY environment variable in your .env file.');
        return;
    }

    console.log(`Testing API key: ...${apiKey.slice(-4)}`);

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent('hello');
        const response = await result.response;
        console.log('Success! The API key is valid.');
        console.log('Response:', response.text());
    } catch (error) {
        console.error('Error: The API key is invalid or expired.');
        console.error('Full error details:', error);
    }
}

testApiKey();