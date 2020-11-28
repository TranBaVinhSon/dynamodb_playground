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
  orgId: number;
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
    orgId: {
      type: Number,
      index: {
        name: "orgId-role-index",
        global: true,
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
  for (let i = 0; i < 20; i++) {
    const workspaceHash = uuidv4();
    const user: User = {
      workspaceHash: workspaceHash,
      email: faker.internet.email(),
      status: faker.random.word(),
      role: faker.random.word(),
      orgId: i % 5,
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

// Query by LSI
async function findByStatus(
  workspaceHash: string,
  status: string
): Promise<User[]> {
  const result: User[] = [];
  // Doesn't work: UnhandledPromiseRejectionWarning: ValidationException: The provided key element does not match the schema:
  // const data = await UserModel.get({
  //   workspaceHash: workspaceHash,
  //   status: status,
  // });

  const users = await UserModel.query({
    workspaceHash: {
      eq: workspaceHash,
    },
    status: {
      eq: status,
    },
  }).exec();
  console.log("users", users);

  users.map((user) => {
    const u: User = {
      workspaceHash: user.workspaceHash,
      role: user.role,
      email: user.email,
      status: user.status,
      orgId: user.orgId,
    };
    result.push(u);
  });
  return result;
}

async function findByRole(
  workspaceHash: string,
  role: string
): Promise<User[]> {
  const result: User[] = [];

  const users = await UserModel.query({
    workspaceHash: {
      eq: workspaceHash,
    },
    role: {
      eq: role,
    },
  }).exec();
  console.log("users", users);

  users.map((user) => {
    const u: User = {
      workspaceHash: user.workspaceHash,
      role: user.role,
      email: user.email,
      status: user.status,
      orgId: user.orgId,
    };
    result.push(u);
  });
  return result;
}

// Query by GSI
async function findByOrgID(orgId: number): Promise<User[]> {
  const result: User[] = [];

  const users = await UserModel.query({
    orgId: {
      eq: orgId,
    },
  }).exec();
  console.log("users", users);

  users.map((user) => {
    const u: User = {
      workspaceHash: user.workspaceHash,
      role: user.role,
      email: user.email,
      status: user.status,
      orgId: user.orgId,
    };
    result.push(u);
  });
  return result;
}

// Query by Global secondary index + Sort key
async function findByOrgIdAndRole(
  orgId: number,
  role: string
): Promise<User[]> {
  const result: User[] = [];

  // Doesn't work: UnhandledPromiseRejectionWarning: ValidationException: Filter Expression can only contain non-primary key attributes: Primary key attribute: role
  // const users = await UserModel.query({
  //   orgId: {
  //     eq: orgId,
  //   },
  //   role: {
  //     eq: role,
  //   },
  // }).exec();

  // const users = await UserModel.query("orgId")
  //   .eq(orgId)
  //   .and()
  //   .where("role")
  //   .eq(role)
  //   .exec();
  // console.log("users", users);

  const users = await UserModel.query("orgId")
    .eq(orgId)
    .where("role") // Using FilterExpression instead of KeyConditionExpression: https://stackoverflow.com/a/41646393
    .eq(role)
    .exec();

  users.map((user) => {
    const u: User = {
      workspaceHash: user.workspaceHash,
      role: user.role,
      email: user.email,
      status: user.status,
      orgId: user.orgId,
    };
    result.push(u);
  });
  return result;
}

async function main(): Promise<void> {
  await seedData();
  // await findByStatus("032129f3-3f82-4fc7-b0b8-d95a67b4e6aa", "deposit");
  // const users = await findByRole(
  //   "1d57631d-4930-4d89-ae62-cf3a4be71139",
  //   "Awesome"
  // );
  // const users = await findByOrgID(2);
  const users = await findByOrgIdAndRole(2, "Analyst");
  console.log(users);
}

main();

// KeyConditionExpression: Using partition key + sort key (better performance + sot)
// FilterExpression: Not really good for performance
