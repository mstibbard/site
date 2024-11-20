---
title: Automated deployments of a Phoenix application to Google Cloud Run and Cloud SQL
description: Learn how to set up automated deployments and migrations for a Phoenix project onto Google Cloud Run and Cloud SQL.
datePublished: '2024-01-26'
dateUpdated: '2024-02-02'
---

<script>
  const yellow = "color:#DCDCAA";
  const blue = "color:#569CD6";
  const green = "color:#6A9955";
  const orange = "color:#CE9178";
  const purple = "color:#C586C0";
  const teal = "color:#4EC9B0";

  $: productName = 'insight';
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

<pre><code><span style={yellow}>mix</span> <span style={orange}>{productName}</span>
<span style={yellow}>cd</span> <span style={orange}>{productName}</span>
<span style={green}># create something for us to test DB interaction with e.g.,</span>
<span style={yellow}>mix</span> <span style={orange}>phx.gen.live Products Product products name brand</span>
<span style={green}># remember to update lib/{productName}_web/router.ex</span>
</code></pre>

In your existing app (or newly generated app), generate a Dockerfile and other useful release helpers with the following command

```sh
mix phx.gen.release --docker
```

Next we update our runtime config to delete the production database environment variables because we will leverage [PostgreSQL environment variables](https://www.postgresql.org/docs/current/libpq-envars.htm) (e.g., `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`), which is conveniently what `Postgrex.start_link/1` [defaults to under the hood](https://hexdocs.pm/postgrex/Postgrex.html#start_link/1) if you do not specify database connection details in your code.

<pre><code><span style={green}># config/runtime.exs</span>
...
<span style={purple}>if</span><span style={yellow}> config_env</span>() == :prod <span style={purple}>do</span>
<span style={green}>  # removed database_url block</span><br/>
  maybe_ipv6 = <span style={purple}>if</span><span style={teal}> System</span>.<span style={yellow}>get_env</span>(<span style={orange}>"ECTO_IPV6"</span>) in <span style={orange}>~w(true 1)</span>, do: [:inet6], else: []<br/>
  config :{productName}, <span style={teal}>{humanize(productName)}</span>.<span style={teal}>Repo</span>,
<span style={green}>    # removed url: database_url</span>
    pool_size: <span style={teal}>String</span>.<span style={yellow}>to_integer</span>(<span style={teal}>System</span>.<span style={yellow}>get_env</span>(<span style={orange}>"POOL_SIZE"</span>) || <span style={orange}>"10"</span>),
    socket_options: maybe_ipv6<br/>
<span style={green}>  # nothing changed beyond this</span>
...</code></pre>

Cloud Run will automatically generate a semi randomised URL for your app once deployed. It will be in the form of `https://[SERVICE NAME]-[RANDOM NUMBERS].a.run.app`. To prevent infinite reloading behaviour in LiveView we need to update `config/prod.exs` to allow-list the Cloud Run origin.

<pre><code><span style={green}># config/prod.exs</span>
config :{productName}, <span style={teal}>{humanize(productName)}</span>.<span style={teal}>Endpoint</span>,
  cache_static_manifest: <span style={orange}>"priv/static/cache_manifest.json"</span>,
  check_origin: [<span style={orange}>"https://*.run.app"</span>] <span style={green}># add this</span>
</code></pre>

## 2. Create a GCP project

Create a new project with the name of your product/service. Please note that project names on GCP must be unique.

<label for="projectID">⭐ INPUT your GCP Project ID:</label>
<input type="text" id="projectID" bind:value={projectID} />

<pre><code><span style={yellow}>gcloud</span><span style={orange}> projects create {projectID}</span></code></pre>

Set the Google Cloud CLI to use the newly created project.

<pre><code><span style={yellow}>gcloud</span><span style={orange}> config set project {projectID}</span></code></pre>

Find the billing account you set up (refer to prerequisites).

```sh
gcloud billing accounts list
```

Link the billing account to the new project.

<label for="billingID">⭐ INPUT your Billing ID:</label>
<input type="text" id="billingID" bind:value={billingID} />

<pre><code><span style={yellow}>gcloud</span><span style={orange}> billing projects link {projectID} \</span>
  <span style={blue}>--billing-account</span> <span style={orange}>{billingID}</span></code></pre>

## 3. Enable the services we need

Google Cloud disables all cloud products/services on a new project by default so we will need to enable all the services we will use for this deployment: Artifact Registry, Cloud Build, Cloud SQL, Secret Manager, Cloud Run, and the IAM API.

The following command will enable all the services we need.

```sh
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

<pre><code><span style={yellow}>gcloud</span><span style={orange}> artifacts repositories create {hyphenize(productName)} \</span>
  <span style={blue}>--repository-format=docker</span><span style={orange}> \</span>
  <span style={blue}>--location={region}</span><span style={orange}> \</span>
  <span style={blue}>--description="{productName} application"</span></code></pre>

Once that is created we need to retrieve the repository's `Registry URL` with the following command:

<pre><code><span style={yellow}>gcloud</span><span style={orange}> artifacts repositories describe {hyphenize(productName)} \</span>
  <span style={blue}>--location</span><span style={orange}> {region}</span></code></pre>

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

<pre><code><span style={yellow}>gcloud</span><span style={orange}> iam service-accounts create {serviceAccount} \</span>
  <span style={blue}>--description="{productName} app service account"</span></code></pre>

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

<pre><code><span style={yellow}>gcloud</span><span style={orange}> projects add-iam-policy-binding {projectID} \</span>
  <span style={blue}>--member="serviceAccount:{serviceAccountEmail}"</span><span style={orange}> \</span>
  <span style={blue}>--role="roles/logging.logWriter"</span><span style={orange}> \</span>
  <span style={blue}>--condition None</span>

<span style={yellow}>gcloud</span><span style={orange}> projects add-iam-policy-binding {projectID} \</span>
  <span style={blue}>--member="serviceAccount:{serviceAccountEmail}"</span><span style={orange}> \</span>
  <span style={blue}>--role="roles/cloudsql.client"</span><span style={orange}> \</span>
  <span style={blue}>--condition None</span>

<span style={yellow}>gcloud</span><span style={orange}> projects add-iam-policy-binding {projectID} \</span>
  <span style={blue}>--member="serviceAccount:{serviceAccountEmail}"</span><span style={orange}> \</span>
  <span style={blue}>--role="roles/artifactregistry.writer"</span><span style={orange}> \</span>
  <span style={blue}>--condition None</span>

<span style={yellow}>gcloud</span><span style={orange}> projects add-iam-policy-binding {projectID} \</span>
  <span style={blue}>--member="serviceAccount:{serviceAccountEmail}"</span><span style={orange}> \</span>
  <span style={blue}>--role="roles/run.developer"</span><span style={orange}> \</span>
  <span style={blue}>--condition None</span>

<span style={yellow}>gcloud</span><span style={orange}> iam service-accounts add-iam-policy-binding "{serviceAccountEmail}" \</span>
  <span style={blue}>--member</span><span style={orange}> "serviceAccount:{serviceAccountEmail}" \</span>
  <span style={blue}>--role</span><span style={orange}> "roles/iam.serviceAccountUser" \</span>
</code></pre>

## 6. Create a Cloud SQL database instance

Create a new PostgreSQL instance specifying your desired region, type of DB, and compute tier. We've used the cheapest tier for this example.

<label for="instanceName">⭐ INPUT your desired database instance name:</label>
<input type="text" id="instanceName" bind:value={instanceName} />

<pre><code><span style={yellow}>gcloud</span><span style={orange}> sql instances create {instanceName} \</span>
  <span style={blue}>--region={region}</span><span style={orange}> \</span>
  <span style={blue}>--database-version=POSTGRES_14</span><span style={orange}> \</span>
  <span style={blue}>--tier=db-f1-micro</span></code></pre>

Now we will create a user for our application to use when interacting with the database.

<label for="dbUser">⭐ INPUT your desired database user name:</label>
<input type="text" id="dbUser" bind:value={dbUser} />

<label for="dbUserPassword">⭐ INPUT your desired database user's password:</label>
<input type="text" id="dbUserPassword" bind:value={dbUserPassword} />

<pre><code><span style={yellow}>gcloud</span><span style={orange}> sql users create {dbUser} \</span>
  <span style={blue}>--instance={instanceName}</span><span style={orange}> \</span>
  <span style={blue}>--password={dbUserPassword}</span></code></pre>

Next we will create our database.

<label for="dbName">⭐ INPUT your desired database name:</label>
<input type="text" id="dbName" bind:value={dbName} />

<pre><code><span style={yellow}>gcloud</span><span style={orange}> sql databases create {dbName} \</span>
  <span style={blue}>--instance</span><span style={orange}> {instanceName}</span></code></pre>

We also need to retrieve our instance `connectionName` for later:

<pre><code><span style={yellow}>gcloud</span><span style={orange}> sql instances describe {instanceName} \</span>
  <span style={blue}>--format='value(connectionName)'</span></code></pre>

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

```sh
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

<pre><code><span style={yellow}>gcloud</span><span style={orange}> secrets add-iam-policy-binding DEV_SECRET_KEY_BASE \</span>
  <span style={blue}>--member="serviceAccount:{serviceAccountEmail}"</span><span style={orange}> \</span>
  <span style={blue}>--role="roles/secretmanager.secretAccessor"</span>

<span style={yellow}>gcloud</span><span style={orange}> secrets add-iam-policy-binding DB_USER \</span>
  <span style={blue}>--member="serviceAccount:{serviceAccountEmail}"</span><span style={orange}> \</span>
  <span style={blue}>--role="roles/secretmanager.secretAccessor"</span>

<span style={yellow}>gcloud</span><span style={orange}> secrets add-iam-policy-binding DB_PASS \</span>
  <span style={blue}>--member="serviceAccount:{serviceAccountEmail}"</span><span style={orange}> \</span>
  <span style={blue}>--role="roles/secretmanager.secretAccessor"</span>

<span style={yellow}>gcloud</span><span style={orange}> secrets add-iam-policy-binding DB_HOST \</span>
  <span style={blue}>--member="serviceAccount:{serviceAccountEmail}"</span><span style={orange}> \</span>
  <span style={blue}>--role="roles/secretmanager.secretAccessor"</span>
</code></pre>

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

<pre><code><span style={blue}>steps</span>:
- <span style={blue}>name</span>:<span style={orange}> 'gcr.io/cloud-builders/docker'</span>
  <span style={blue}>id</span>:<span style={orange}> Build and Push Docker Image</span>
  <span style={blue}>script</span>:<span style={purple}> |</span>
    <span style={orange}>docker build -t $&#123;_IMAGE_NAME&#125;:latest .</span>
    <span style={orange}>docker push $&#123;_IMAGE_NAME&#125;:latest</span>

- <span style={blue}>name</span>:<span style={orange}> 'gcr.io/cloud-builders/docker'</span>
  <span style={blue}>id</span>:<span style={orange}> Start Cloud SQL Proxy to Postgres</span>
  <span style={blue}>args</span>: [
      <span style={orange}>'run'</span>,
      <span style={orange}>'-d'</span>,
      <span style={orange}>'--name'</span>,
      <span style={orange}>'cloudsql'</span>,
      <span style={orange}>'-p'</span>,
      <span style={orange}>'5432:5432'</span>,
      <span style={orange}>'--network'</span>,
      <span style={orange}>'cloudbuild'</span>,
      <span style={orange}>'gcr.io/cloud-sql-connectors/cloud-sql-proxy'</span>,
      <span style={orange}>'--address'</span>,
      <span style={orange}>'0.0.0.0'</span>,
      <span style={orange}>'$&#123;_INSTANCE_CONNECTION_NAME&#125;'</span>
    ]

- <span style={blue}>name</span>:<span style={orange}> 'postgres'</span>
  <span style={blue}>id</span>:<span style={orange}> Wait for Cloud SQL Proxy to be available</span>
  <span style={blue}>script</span>:<span style={purple}> |</span>
    <span style={orange}>until pg_isready -h cloudsql ; do sleep 1; done</span>

- <span style={blue}>name</span>:<span style={orange}> $&#123;_IMAGE_NAME&#125;:latest</span>
  <span style={blue}>id</span>:<span style={orange}> Run migrations</span>
  <span style={blue}>env</span>:
  - <span style={orange}>MIX_ENV=prod</span>
  - <span style={orange}>SECRET_KEY_BASE=fake-key</span>
  - <span style={orange}>PGHOST=cloudsql</span>
  - <span style={orange}>PGDATABASE=$&#123;_DATABASE_NAME&#125;</span>
  <span style={blue}>secretEnv</span>:
  - <span style={orange}>PGUSER</span>
  - <span style={orange}>PGPASSWORD</span>
  <span style={blue}>script</span>:<span style={purple}> |</span>
    <span style={orange}>/app/bin/{productName} eval "{humanize(productName)}.Release.migrate"</span>

- <span style={blue}>name</span>:<span style={orange}> 'gcr.io/cloud-builders/gcloud'</span>
  <span style={blue}>id</span>:<span style={orange}> Deploy to Cloud Run</span>
  <span style={blue}>script</span>:<span style={purple}> |</span>
    <span style={orange}>gcloud run deploy $&#123;_SERVICE_NAME&#125; \
      --image $&#123;_IMAGE_NAME&#125;:latest \
      --region $&#123;LOCATION&#125; \
      --platform managed \
      --allow-unauthenticated \
      --set-secrets=SECRET_KEY_BASE=DEV_SECRET_KEY_BASE:latest \
      --set-secrets=PGHOST=DB_HOST:latest \
      --set-secrets=PGUSER=DB_USER:latest \
      --set-secrets=PGPASSWORD=DB_PASS:latest \
      --set-env-vars=PGDATABASE=$&#123;_DATABASE_NAME&#125; \
      --add-cloudsql-instances=$&#123;_INSTANCE_CONNECTION_NAME&#125; \
      --service-account=$&#123;_SERVICE_ACCOUNT&#125;</span>

<span style={blue}>availableSecrets</span>:
  <span style={blue}>secretManager</span>:
  - <span style={orange}>versionName: {dbUserSecretPath}/versions/latest</span>
    <span style={blue}>env</span>: <span style={orange}>'PGUSER'</span>
  - <span style={orange}>versionName: {dbPassSecretPath}/versions/latest</span>
    <span style={blue}>env</span>: <span style={orange}>'PGPASSWORD'</span>

<span style={blue}>images</span>:
  - <span style={orange}>$&#123;_IMAGE_NAME&#125;:latest</span>

<span style={blue}>options</span>:
  <span style={blue}>automapSubstitutions</span>: <span style={blue}>true</span>
  <span style={blue}>logging</span>: <span style={orange}>CLOUD_LOGGING_ONLY</span>

<span style={blue}>substitutions</span>:
  <span style={blue}>_DATABASE_NAME</span>: <span style={orange}>{dbName}</span>
  <span style={blue}>_IMAGE_NAME</span>: <span style={orange}>{registryUrl}/{compiledAppName}</span>
  <span style={blue}>_INSTANCE_CONNECTION_NAME</span>: <span style={orange}>{connectionName}</span>
  <span style={blue}>_SERVICE_ACCOUNT</span>: <span style={orange}>{serviceAccountEmail}</span>
  <span style={blue}>_SERVICE_NAME</span>: <span style={orange}>{serviceName}</span>
</code></pre>

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

<pre><code><span style={yellow}>./cloud-sql-proxy</span><span style={blue}> --port</span><span style="color:#B5CEA8"> 54321</span><span style={orange}> {connectionName}</span></code></pre>

If successful you will see see output similar to:

```sh
Authorizing with Application Default Credentials
Listening on 127.0.0.1:54321
```

Now we can psql in!

<pre><code><span style={yellow}>psql</span><span style={orange}> host="127.0.0.1 port=54321 sslmode=disable user={dbUser} dbname={dbName}"</span></code></pre>

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
