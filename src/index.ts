import * as dynamoose from "dynamoose";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import faker from "faker";
dotenv.config();

const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION;
const dynamoDBTable = process.env.DYNAMODB_TABLE || "";

console.log(accessKey, secretKey, region, dynamoDBTable);

interface User {
  workspaceHash: string;
  email: string;
  status: string;
  role: string;
}

dynamoose.aws.sdk.config.update({
  accessKeyId: accessKey,
  secretAccessKey: secretKey,
  region: region,
});

const schema = new dynamoose.Schema(
  {
    workspaceHash: {
      type: String,
      hashKey: true,
    },
    email: {
      type: String,
      rangeKey: true,
    },
    status: {
      type: String,
      index: {
        name: "workspaceHash-status-index",
        global: false,
      },
    },
  },
  {
    saveUnknown: true,
    timestamps: true,
  }
);

const UserModel = dynamoose.model(dynamoDBTable, schema, {
  create: false,
});

async function seedData(): Promise<void> {
  const users: User[] = [];
  for (let i = 0; i < 100; i++) {
    const workspaceHash = uuidv4();
    const user: User = {
      workspaceHash: workspaceHash,
      email: faker.internet.email(),
      status: faker.random.word(),
      role: faker.random.word(),
    };
    users.push(user);
  }
  await upsert(users);
}

async function upsert(users: User[]): Promise<void> {
  const updateUsers: User[] = [];
  for (let i = 0; i < users.length; i++) {
    const result = await UserModel.query("workspaceHash")
      .eq(users[i].workspaceHash)
      .exec();
    if (result.count != 0) {
      updateUsers.push(users[i]);
    } else {
      await UserModel.create(users[i]);
    }
  }

  for (let i = 0; i < Math.ceil(updateUsers.length / 25); i++) {
    const slicedUsers = updateUsers.slice(i * 25, (i + 1) * 25);
    await UserModel.batchPut(slicedUsers);
  }
}

async function main(): Promise<void> {
  await seedData();
}

main();
