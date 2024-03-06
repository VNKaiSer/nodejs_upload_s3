const express = require("express");
const app = express();
let customers = require("./data.js");
const bodyParser = require("body-parser");
const AWS = require("aws-sdk");
require("dotenv").config();
const path = require("path");
const multer = require("multer");

// middlewares
app.use(express.json({ extended: true }));
app.use(express.static("./views"));

// views
app.set("view engine", "ejs");
app.set("views", "./views");
const PORT = 3000;

// Config AWS

AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const tableName = "customer";

// Config Multer

const storage = multer.memoryStorage({
  destination(req, file, callback) {
    callback(null, "");
  },
});

const upload = multer({
  storage,
  limits: { fieldSize: 2000000 },
  fileFilter(req, file, callback) {
    checkFileType(file, callback);
  },
});

function checkFileType(file, callback) {
  const fileTypes = /jpeg|jpg|png|gif/;

  if (!file.originalname) {
    return callback("Error: Original file name not provided");
  }

  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);

  if (extname && mimetype) {
    return callback(null, true);
  }

  return callback("Error: Invalid file type");
}

// Route

app.get("/", async (req, res) => {
  try {
    const params = { TableName: tableName };
    const responsive = await dynamoDB.scan(params).promise();
    const customers = Array.isArray(responsive.Items)
      ? responsive.Items
      : [responsive.Items];
    console.log(customers);
    console.log(customers.length);
    return res.render("index", { customers });
  } catch {
    console.log("Error no fetching data from DynamoDB");
    return res.status(500).send("500 - Internal Server Error");
  }
});

app.post("/", upload.single("avatar"), async (req, res) => {
  console.log(upload.single("avatar"));
  try {
    const params = { TableName: tableName };
    const customers = await dynamoDB.scan(params).promise();

    const id = "SP" + (customers.Count + 1);

    const name = req.body.name;
    const email = req.body.email;
    const company = req.body.company;
    const country = req.body.country;
    // console.log(req.file)
    const image = req.file.originalname.split(".");

    const fileType = image[image.length - 1];
    const filePath = `${id + Date.now().toString()}.${fileType}`;

    const paramsS3 = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: filePath,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    s3.upload(paramsS3, async (err, data) => {
      if (err) {
        console.error("error=", err);
        return res.status(500).send("500 - Internal Server Error");
      } else {
        const imageUrl = data.Location;
        const paramsDynamoDb = {
          TableName: tableName,
          Item: {
            id,
            name,
            email,
            company,
            country,
            image: imageUrl,
          },
        };

        await dynamoDB.put(paramsDynamoDb).promise();

        return res.redirect("/");
      }
    });
  } catch (error) {}
});

app.post("/delete", (req, res) => {
  const dataDelete = Object.keys(req.body);
  customers = customers.filter((i) => !dataDelete.includes(i.id + ""));
  console.log(customers);

  return res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}!`);
});
