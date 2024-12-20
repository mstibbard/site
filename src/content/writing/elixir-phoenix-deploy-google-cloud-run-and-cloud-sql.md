---
title: Automated deployments of a Phoenix application to Google Cloud Run and Cloud SQL
description: Learn how to set up automated deployments and migrations for a Phoenix project onto Google Cloud Run and Cloud SQL.
datePublished: '2024-01-26'
dateUpdated: '2024-02-02'
---

<script>
  $: productName = 'insight';
  $: productNameHumanized = humanize(productName);
  $: productNameHyphenized = hyphenize(productName);
  $: projectID = `${hyphenize(productName)}-098765`;
  $: billingID = '000000-000000-000000';
  $: region = 'australia-southeast1';
  $: registryUrl = `${region}-docker.pkg.dev/${projectID}/${hyphenize(productName)}`;
  $: compiledAppName = 'app';
  $: serviceAccount = `${hyphenize(productName)}-sa`;
  $: serviceAccountEmail = `${serviceAccount}@${projectID}.iam.gserviceaccount.com`;
  $: instanceName = hyphenize(productName);
  $: dbUser = `${productName}_admin`;
  $: dbUserPassword = 'pa55w0rd';
  $: connectionName = `${projectID}:${region}:${instanceName}`;
  $: dbName = `${productName}_dev`;
  $: proxyPath = `/Users/your_username/cloudsql/${connectionName}/.s.PGSQL.5432`;
  $: serviceName = `${hyphenize(productName)}-dev`;
  $: dbUserSecretPath = 'projects/123456789/secrets/DB_USER'
  $: dbPassSecretPath = 'projects/123456789/secrets/DB_PASS'

  function humanize(str) {
    var i, frags = str.split('_');
    for (i=0; i<frags.length; i++) {
      frags[i] = frags[i].charAt(0).toUpperCase() + frags[i].slice(1);
    }
    return frags.join('');
  }

  function hyphenize(str) {
    const regex = /_/g;
    return  str.replace(regex, "-");
  }
</script>

This post explains how to set up **automated deployments and migrations** for a Phoenix project on Google Cloud's managed services using the [Google Cloud CLI](https://cloud.google.com/sdk/gcloud) (mostly). The Phoenix app will be hosted on Google Cloud Run and the PostgreSQL database will be hosted on Cloud SQL. Deployments will be automatically triggered when changes are pushed to the `main` branch of your git repository (GitHub specifically in this post).

This post allows you to input your own specific values throughout the journey to make following along considerably easier. Look out for <span class="input-label">⭐ INPUT</span>.

At a high level we will:

1. Prepare your application
2. Create a GCP project
3. Enable the services we need
4. Create an Artifact Registry repository to store our compiled app
5. Create a service account
6. Create a Cloud SQL database instance
7. Create environment variables in Secrets Manager
8. Connect a GitHub repository to Cloud Build
9. Create a Cloud Build trigger
10. Create a build configuration file
11. Trigger a deploy to Cloud Run
12. (OPTIONAL) psql into Cloud SQL

## Prerequisites

- A Google account
- The [Google Cloud CLI](https://cloud.google.com/sdk/gcloud) installed and logged in
- A billing account set up on your Google Cloud organisation

Note: This was written using MacOS on an M1 Macbook. Some commands and steps may require variations if you are on a different OS/architecture.

## 1. Prepare your application

If you don't have an app ready to go but want to following along, I suggest generating a basic project with the following series of commands:

<label for="productName">⭐ INPUT your product name:</label>
<input type="text" id="productName" bind:value={productName} />

```shell
mix {{{productName}}}
cd {{{productName}}}
# create something for us to test DB interaction with e.g.,
mix phx.gen.live Products Product products name brand
# remember to update lib/{{{productName}}}_web/router.ex
```

In your existing app (or newly generated app), generate a Dockerfile and other useful release helpers with the following command

```sh
mix phx.gen.release --docker
```

Next we update our runtime config to delete the production database environment variables because we will leverage [PostgreSQL environment variables](https://www.postgresql.org/docs/current/libpq-envars.htm) (e.g., `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`), which is conveniently what `Postgrex.start_link/1` [defaults to under the hood](https://hexdocs.pm/postgrex/Postgrex.html#start_link/1) if you do not specify database connection details in your code.

```elixir
# config/runtime.exs
...
if config_env() == :prod do
  # removed database_url block

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  config :{{{productName}}}, {{{productNameHumanized}}}.Repo,
    # removed url: database_url
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    socket_options: maybe_ipv6

  # nothing changed beyond this
...
```

Cloud Run will automatically generate a semi randomised URL for your app once deployed. It will be in the form of `https://[SERVICE NAME]-[RANDOM NUMBERS].a.run.app`. To prevent infinite reloading behaviour in LiveView we need to update `config/prod.exs` to allow-list the Cloud Run origin.

```elixir
# config/prod.exs
config :{{{productName}}}, {{{productNameHumanized}}}.Endpoint,
  cache_static_manifest: "priv/static/cache_manifest.json",
  check_origin: ["https://*.run.app"] # add this

```

## 2. Create a GCP project

Create a new project with the name of your product/service. Please note that project names on GCP must be unique.

<label for="projectID">⭐ INPUT your GCP Project ID:</label>
<input type="text" id="projectID" bind:value={projectID} />

```shell
gcloud projects create {{{projectID}}}
```

Set the Google Cloud CLI to use the newly created project.

```shell
gcloud config set project {{{projectID}}}
```

Find the billing account you set up (refer to prerequisites).

```shell
gcloud billing accounts list
```

Link the billing account to the new project.

<label for="billingID">⭐ INPUT your Billing ID:</label>
<input type="text" id="billingID" bind:value={billingID} />

```shell
gcloud billing projects link {{{projectID}}} \
  --billing-account {{{billingID}}}
```

## 3. Enable the services we need

Google Cloud disables all cloud products/services on a new project by default so we will need to enable all the services we will use for this deployment: Artifact Registry, Cloud Build, Cloud SQL, Secret Manager, Cloud Run, and the IAM API.

The following command will enable all the services we need.

```shell
gcloud services enable \\
  artifactregistry.googleapis.com \\
  cloudbuild.googleapis.com \\
  sqladmin.googleapis.com \\
  secretmanager.googleapis.com \\
  run.googleapis.com \\
  iam.googleapis.com
```

## 4. Create an Artifact Registry repository to store our compiled app

Create a new repository with an identifier (I generally align this with my elixir app name) and specifying the format and region.

<label for="region">⭐ INPUT your desired GCP Region:</label>
<input type="text" id="region" bind:value={region} />

```shell
gcloud artifacts repositories create {{{productNameHyphenized}}} \\
  --repository-format=docker \\
  --location={{{region}}} \\
  --description="{{{productName}}} application"
```

Once that is created we need to retrieve the repository's `Registry URL` with the following command:

```shell
gcloud artifacts repositories describe {{{productNameHyphenized}}} \\
  --location {{{region}}}
```

It will look something like `REGION-docker.pkg.dev/PROJECT-NAME/REPOSITORY-NAME`.

<label for="registryUrl">⭐ INPUT the full Registry URL:</label>
<input type="text" id="registryUrl" bind:value={registryUrl} />

We won't use these until later, but let's define what we want to call our compiled artifact:

<label for="compiledAppName">⭐ INPUT your desired compiled artifact name:</label>
<input type="text" id="compiledAppName" bind:value={compiledAppName} />

Note: Later on your compiled image will look something like <code>{registryUrl}/{compiledAppName}:latest</code>. At build time we tag it with `latest` for easy reference.

## 5. Create a service account

This service account will own our Cloud Run app and will need various permissions to services and secrets.

Create the service account with a useful identifier.

<label for="serviceAccount">⭐ INPUT your desired Service Account name:</label>
<input type="text" id="serviceAccount" bind:value={serviceAccount} />

```shell
gcloud iam service-accounts create {{{serviceAccount}}} \\
  --description="{{{productName}}} app service account"
```

Service accounts are referenced using a fully qualified email address, not just a name. To retrieve the full email address for the service account we just created run:

```sh
gcloud iam service-accounts list
```

It will look something like `NAME@PROJECT.iam.gserviceaccount.com`.

<label for="serviceAccountEmail">⭐ INPUT your full Service Account email:</label>
<input type="text" id="serviceAccountEmail" bind:value={serviceAccountEmail} />

We will also provide some IAM permissions to the Service Account that will be needed later:

- `roles/logging.logWriter` permissions are required by Cloud Build
- `roles/cloudsql.client` permissions are required to interact with Cloud SQL
- `roles/artifactregistry.writer` permissions are required to read/write to Artifact Registry
- `roles/run.developer` permissions are required to deploy on Cloud Run
- `roles/iam.serviceAccountUser` permissions are required to allow the Service Account to "act as" another service account and assign ownership of services (such as Cloud Run). In this case the account is acting as itself, but it is still required despite being self-referential

Above can be added with the following commands:

```shell
gcloud projects add-iam-policy-binding {{{projectID}}} \\
  --member="serviceAccount:{{{serviceAccountEmail}}}" \\
  --role="roles/logging.logWriter" \\
  --condition None

gcloud projects add-iam-policy-binding {{{projectID}}} \\
  --member="serviceAccount:{{{serviceAccountEmail}}}" \\
  --role="roles/cloudsql.client" \\
  --condition None

gcloud projects add-iam-policy-binding {{{projectID}}} \\
  --member="serviceAccount:{{{serviceAccountEmail}}}" \\
  --role="roles/artifactregistry.writer" \\
  --condition None

gcloud projects add-iam-policy-binding {{{projectID}}} \\
  --member="serviceAccount:{{{serviceAccountEmail}}}" \\
  --role="roles/run.developer" \\
  --condition None

gcloud iam service-accounts add-iam-policy-binding "{{{serviceAccountEmail}}}" \\
  --member "serviceAccount:{{{serviceAccountEmail}}}" \\
  --role "roles/iam.serviceAccountUser"
```

## 6. Create a Cloud SQL database instance

Create a new PostgreSQL instance specifying your desired region, type of DB, and compute tier. We've used the cheapest tier for this example.

<label for="instanceName">⭐ INPUT your desired database instance name:</label>
<input type="text" id="instanceName" bind:value={instanceName} />

```shell
gcloud sql instances create {{{instanceName}}} \\
  --region={{{region}}} \\
  --database-version=POSTGRES_14 \\
  --tier=db-f1-micro
```

Now we will create a user for our application to use when interacting with the database.

<label for="dbUser">⭐ INPUT your desired database user name:</label>
<input type="text" id="dbUser" bind:value={dbUser} />

<label for="dbUserPassword">⭐ INPUT your desired database user's password:</label>
<input type="text" id="dbUserPassword" bind:value={dbUserPassword} />

```shell
gcloud sql users create {{{dbUser}}} \\
  --instance={{{instanceName}}} \\
  --password={{{dbUserPassword}}}
```

Next we will create our database.

<label for="dbName">⭐ INPUT your desired database name:</label>
<input type="text" id="dbName" bind:value={dbName} />

```shell
gcloud sql databases create {{{dbName}}} \\
  --instance {{{instanceName}}}
```

We also need to retrieve our instance `connectionName` for later:

```shell
gcloud sql instances describe {{{instanceName}}} \\
  --format='value(connectionName)'
```

The connection name will look something like `PROJECT:REGION:INSTANCE-NAME`.

<label for="connectionName">⭐ INPUT the full Connection Name:</label>
<input type="text" id="connectionName" bind:value={connectionName} />

## 7. Create environment variables in Secrets Manager

Now we need to create the secrets on GCP that our Phoenix app will use (on Cloud Run). We will create these in Secrets Manager:

- `DEV_SECRET_KEY_BASE` (mapped to SECRET_KEY_BASE in deploy step)
- `DB_USER` (mapped to PGUSER in deploy step)
- `DB_PASS` (mapped to PGPASSWORD in deploy step)
- `DB_HOST` (mapped to PGHOST in deploy step)

Create each of these txt files and populate with your relevant secrets:

- `db-user.txt` contains <code>{dbUser}</code>
- `db-pass.txt` contains <code>{dbUserPassword}</code>
- `db-host.txt` contains <code>/cloudsql/{connectionName}</code> (this is your connection name prepended with `/cloudsql/`)

Once the txt files are created, run each of the following commands to create the secrets:

```shell
# string payload, pipe the secret value into the gcloud command
mix phx.gen.secret | gcloud secrets create DEV_SECRET_KEY_BASE --data-file=-

# file payload, considered the safer way
gcloud secrets create DB_USER --data-file=db-user.txt
gcloud secrets create DB_PASS --data-file=db-pass.txt
gcloud secrets create DB_HOST --data-file=db-host.txt
```

Notes:

- The name of secrets in Secrets Manager **_does not_** have to match the application environment variable name because there is a mapping exercise during the final deployment step.
- **Do not commit** the txt files to your git repository
- Secrets Manager expects a file (or string) payload. If sending a string the `--data-file` must be set to `-`. I've used both methods above for demonstration purposes
- You can retrieve the value of the secrets by running either of the following:
  - `gcloud secrets versions access 1 --secret="DB_HOST"`
  - `gcloud secrets versions access latest --secret="DEV_SECRET_KEY_BASE"`
- Google encourages use of data files for secrets instead of sending strings directly on the command line. This is because direct command line creations are stored in plaintext in your processes and shell history

Next we need to provide the Service Account with permission to access all of these secrets.

```shell
gcloud secrets add-iam-policy-binding DEV_SECRET_KEY_BASE \\
  --member="serviceAccount:{{{serviceAccountEmail}}}" \\
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding DB_USER \\
  --member="serviceAccount:{{{serviceAccountEmail}}}" \\
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding DB_PASS \\
  --member="serviceAccount:{{{serviceAccountEmail}}}" \\
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding DB_HOST \\
  --member="serviceAccount:{{{serviceAccountEmail}}}" \\
  --role="roles/secretmanager.secretAccessor"
```

We also need to retrieve the paths for the `DB_USER` and `DB_PASS` for use later:

```sh
gcloud secrets describe DB_USER
gcloud secrets describe DB_PASS
```

<label for="dbUserSecretPath">⭐ INPUT the path to the DB_USER:</label>
<input type="text" id="dbUserSecretPath" bind:value={dbUserSecretPath} />

<label for="dbPassSecretPath">⭐ INPUT the path to the DB_PASS:</label>
<input type="text" id="dbPassSecretPath" bind:value={dbPassSecretPath} />

The numbers will certainly differ from the example provided.

## 8. Connect a GitHub repository to Cloud Build

This step and the next step are easier via [Google Cloud Console > Cloud Build > Repositories](https://console.cloud.google.com/cloud-build/repositories).

Click "CREATE HOST CONNECTION" and populate the fields (E.g., region <code>{region}</code>).

It will then take you through authentication with GitHub. You will have an option to provide access to all of your GitHub repositories or just a selection. Pick whatever makes sense for your needs.

After you have successfully created a connection, click "LINK A REPOSITORY". Select the connection we just created, and your Phoenix app repository. Choose generated repository names.

## 9. Create a Cloud Build trigger

Now we create a trigger via [Google Cloud Console > Cloud Build > Triggers](https://console.cloud.google.com/cloud-build/triggers).

Click "CREATE TRIGGER" and populate with your desired details:

- Name: Can be anything (e.g., `main-trunk`)
- Region: {region}
- Event: Push to a branch
- Source: 2nd gen
- Repository: Select the one you linked in prior step
- Branch: Will auto populate with a regular expression to match the main branch `^main$`
- Type: Cloud Build configuration file
- Location: Repository
- Cloud Build configuration file location: `/cloudbuild.yaml`
- Service account: <code>{serviceAccountEmail}</code>

## 10. Create a build configuration file

In your Phoenix project's root directory create a `cloudbuild.yaml` file and populate it with the below codeblock.

<label for="serviceName">⭐ INPUT your desired Cloud Run service name:</label>
<input type="text" id="serviceName" bind:value={serviceName} />

```yaml
steps:
- name: 'gcr.io/cloud-builders/docker'
  id: Build and Push Docker Image
  script: |
    docker build -t ${_IMAGE_NAME}:latest .
    docker push ${_IMAGE_NAME}:latest

- name: 'gcr.io/cloud-builders/docker'
  id: Start Cloud SQL Proxy to Postgres
  args: [
      'run',
      '-d',
      '--name',
      'cloudsql',
      '-p',
      '5432:5432',
      '--network',
      'cloudbuild',
      'gcr.io/cloud-sql-connectors/cloud-sql-proxy',
      '--address',
      '0.0.0.0',
      '${_INSTANCE_CONNECTION_NAME}'
    ]

- name: 'postgres'
  id: Wait for Cloud SQL Proxy to be available
  script: |
    until pg_isready -h cloudsql ; do sleep 1; done

- name: ${_IMAGE_NAME}:latest
  id: Run migrations
  env:
  - MIX_ENV=prod
  - SECRET_KEY_BASE=fake-key
  - PGHOST=cloudsql
  - PGDATABASE=${_DATABASE_NAME}
  secretEnv:
  - PGUSER
  - PGPASSWORD
  script: |
    /app/bin/{{{productName}}} eval "{{{productNameHumanized}}}.Release.migrate"

- name: 'gcr.io/cloud-builders/gcloud'
  id: Deploy to Cloud Run
  script: |
    gcloud run deploy ${_SERVICE_NAME} \\
      --image ${_IMAGE_NAME}:latest \\
      --region ${LOCATION} \\
      --platform managed \\
      --allow-unauthenticated \\
      --set-secrets=SECRET_KEY_BASE=DEV_SECRET_KEY_BASE:latest \\
      --set-secrets=PGHOST=DB_HOST:latest \\
      --set-secrets=PGUSER=DB_USER:latest \\
      --set-secrets=PGPASSWORD=DB_PASS:latest \\
      --set-env-vars=PGDATABASE=${_DATABASE_NAME} \\
      --add-cloudsql-instances=${_INSTANCE_CONNECTION_NAME} \\
      --service-account=${_SERVICE_ACCOUNT}

availableSecrets:
  secretManager:
  - versionName:\ {{{dbUserSecretPath}}}/versions/latest
    env: 'PGUSER'
  - versionName:\ {{{dbPassSecretPath}}}/versions/latest
    env: 'PGPASSWORD'

images:
  - ${_IMAGE_NAME}:latest

options:
  automapSubstitutions: true
  logging: CLOUD_LOGGING_ONLY

substitutions:
  _DATABASE_NAME:\ {{{dbName}}}
  _IMAGE_NAME:\ {{{registryUrl}}}/{{{compiledAppName}}}
  _INSTANCE_CONNECTION_NAME:\ {{{connectionName}}}
  _SERVICE_ACCOUNT:\ {{{serviceAccountEmail}}}
  _SERVICE_NAME:\ {{{serviceName}}}
```

Notes:

- To summarise the above script it:
  - Builds our application image and pushes it to Artifact Repository
  - Starts a Cloud SQL Proxy within the Cloud Build environment
  - Waits to ensure the proxy is functional
  - Executes up migrations against the database
    - Despite using `MIX_ENV=prod` we are still interacting with <code>{dbName}</code> via the `PGDATABASE` environment variable
    - The migrations are run using the scripts generated by `mix phx.gen.release --docker`
    - Uses our freshly built image and utilises the PostgreSQL environment variables (`PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`)
  - Deploys our Cloud Run service
    - Uses our freshly built image
    - Maps the secrets and environment variables
    - Assigns our service account as the owner
    - Links our Cloud SQL instance
- We make use of [substitute variables](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values) to make it easier to work with the document. Because we are using a mix of `script:` and `arg:` approaches we need to set the `automapSubstitutions: true` option otherwise our builds will fail
- To learn more about the elements of the above script refer to the `cloudbuild.yaml` structure [docs](https://cloud.google.com/build/docs/build-config-file-schema).

## 11. Trigger a deploy to Cloud Run

Commit the `cloudbuild.yaml` file (or any other change) and push it to your GitHub repository and watch it build. You can manually trigger builds via [Google Cloud Console > Cloud Build > Triggers](https://console.cloud.google.com/cloud-build/triggers).

You can view previous builds and stream in-progress builds on the [Cloud Build History tab](https://console.cloud.google.com/cloud-build/builds).

You should now have a fully deployed application on GCP!

If at any time you need to retrieve details of this service you can do so with the following command

```sh
gcloud run services list
```

## 12. (OPTIONAL) psql into Cloud SQL

If we want to remotely connect to our Cloud SQL database we can use a tool called Cloud SQL Proxy. This allows us to securely connect via API to our database using our Google Cloud SDK credentials.

Download and install the [Cloud SQL Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy#install). Follow the instructions at the link.

Cloud SQL Proxy utilises your Google Cloud SDK credentials for auth. You can set them with:

```sh
gcloud auth application-default login
```

Start the proxy using our `connectionName`. The port must not already be in use.

```shell
./cloud-sql-proxy --port 54321 {{{connectionName}}}
```

If successful you will see see output similar to:

```sh
Authorizing with Application Default Credentials
Listening on 127.0.0.1:54321
```

Now we can psql in!

```shell
psql host="127.0.0.1 port=54321 sslmode=disable user={{{dbUser}}} dbname={{{dbName}}}"
```

<style>
  input[type=text] {
    width:100%;
    height:2.5rem;
    padding-left:0.75rem;
    padding-right:0.75rem;
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
    border-radius:4px;
    border-width:1px;
    font-family:inherit;
    font-size:0.875rem;
    line-height:1.25rem;
  }
  label {
    display:inline-block;
    font-weight:600;
    font-size:0.875rem;
    line-height:1.25rem;
  }
</style>
