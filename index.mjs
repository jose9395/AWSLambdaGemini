// import Jimp from 'jimp';
// import { GoogleGenerativeAI } from '@google/generative-ai';
// import dotenv from 'dotenv';

// dotenv.config();

// const genAI = new GoogleGenerativeAI(process.env.API_KEY);

// export const handler = async (event) => {
//   try {
//     const requestBody = JSON.parse(event.body);
//     const base64Image = requestBody.picture;
//     const imageBuffer = Buffer.from(base64Image, 'base64');
//     const imagePart = await fileToGenerativePart(imageBuffer);

//     if (imagePart === null) {
//       return {
//         statusCode: 500,
//         body: JSON.stringify("Error processing the image."),
//       };
//     }

//     const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
//     const prompt = "Given the provided image of the object, calculate the dimensions of the smallest rectangular (cuboid) box that can contain the object. Ensure the dimensions are accurate and present them in the following format: length × breadth × depth in cm";
//     const result = await model.generateContent([prompt, imagePart]);
//     const response = result.response;
//     const text = response.text();

//     return {
//       statusCode: 200,
//       body: JSON.stringify(text),
//     };
//   } catch (error) {
//     console.error(error);
//     return {
//       statusCode: 500,
//       body: JSON.stringify("Error processing image"),
//     };
//   }
// };

// async function fileToGenerativePart(buffer) {
//   try {
//     const image = await Jimp.read(buffer);
//     const imageBuffer = await image.quality(90).getBufferAsync(Jimp.MIME_JPEG);
//     return {
//       inlineData: {
//         data: imageBuffer.toString("base64"),
//         mimeType: "image/jpeg",
//       },
//     };
//   } catch (error) {
//     console.error("Error processing file:", error);
//     return null;
//   }
// }


// Connection to S3 and insertion in mongoDB

import Jimp from 'jimp';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const s3 = new AWS.S3({
  accessKeyId : process.env.ACCESS_ID,
  secretAccessKey : process.env.ACCESS_KEY,
  region : "ap-south-1"
});
const mongoClient = new MongoClient(process.env.MONGO_URI);

export const handler = async (event) => {
  try {
    const requestBody = JSON.parse(event.body);
    const base64Image = requestBody.picture;
    const imageBuffer = Buffer.from(base64Image, 'base64');
    const imagePart = await fileToGenerativePart(imageBuffer);

    if (imagePart === null) {
      return {
        statusCode: 500,
        body: JSON.stringify("Error processing the image."),
      };
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    const prompt = "Given the provided image of the object, calculate the dimensions of the smallest rectangular (cuboid) box that can contain the object. Ensure the dimensions are accurate and present them in the following format: length × breadth × depth in cm^";
    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response;
    const text = response.text();

    // Upload the image to S3 and get the URL
    const imgPath = await uploadImageToS3(imageBuffer);

    // Generate unique identifier
    const uniqueIdentifier = uuidv4();

    // Connect to MongoDB and save the response
    await mongoClient.connect();
    const database = mongoClient.db(process.env.MONGO_DB_NAME);
    const collection = database.collection('Images');
    const doc = {
      imgPath: imgPath,
      remarks: "",
      uniqueIdentifier: uniqueIdentifier,
      dimensions: text
    };
    const resultInsert = await collection.insertOne(doc);

    return {
      statusCode: 200,
      body: JSON.stringify(doc),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify("Error processing image"),
    };
  } finally {
    await mongoClient.close();
  }
};

async function fileToGenerativePart(buffer) {
  try {
    const image = await Jimp.read(buffer);
    const imageBuffer = await image.quality(90).getBufferAsync(Jimp.MIME_JPEG);
    return {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType: "image/jpeg",
      },
    };
  } catch (error) {
    console.error("Error processing file:", error);
    return null;
  }
}

async function uploadImageToS3(buffer) {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `${uuidv4()}.jpg`, // unique filename
    Body: buffer,
    ContentEncoding: 'base64',
    ContentType: 'image/jpeg',
  };

  const data = await s3.upload(params).promise();
  return data.Location; // URL of the uploaded image
}
