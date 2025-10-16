import axios from "axios";

const API_VERSION = process.env.API_VERSION || 'v1';
const BASE_URL = `http://localhost:3000/${API_VERSION}/trips/search`;

const params = {
    from: 'CMB',
    to: 'BKK'
};

console.log(`calling API Version ${API_VERSION}`); 
axios.get(BASE_URL, { params })
    .then(response => {
        console.log('Response:', JSON.stringify(response.data));
    })
    .catch(error => {
        console.error('Error:', error.message);
    })