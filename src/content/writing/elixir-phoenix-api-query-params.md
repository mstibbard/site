---
title: Handling multiple API query parameters in Phoenix
description: How to cleanly handle multiple API query parameters when building APIs in Elixir and Phoenix
datePublished: '2023-12-23'
---

Often when building REST APIs we want to provide users flexibility in what will be returned for a given endpoint. Some common examples include filtering results, sorting results, altering page sizes (when paginating) or providing a search capability. Today we will implement two: searching and filtering.

Fortunately this is _really_ easy to achieve in Elixir and Phoenix! The combination of Elixir's pipe operator, pattern matching, and ease of composing queries with Ecto makes this a breeze.

To demonstrate, we will create a simple API to manage products. We will then update the endpoint that lists all products (`/api/products`) to accept query parameters to provide simple text search and/or filter by brand. By the end of this your API will be able to handle requests such as:

- `/api/products?brand=Ona`
- `/api/products?search_term=decaf`
- `/api/products?search_term=decaf&brand=Ona`

## Set up a demonstration project

1. Create our demo project (named `Insight`) and setup our local database

```bash
mix phx.new insight --no-assets --no-html
cd insight
mix ecto.create
```

2. Generate our set of endpoints to create, read, update and delete products. Each product will have a name and a brand. If you want to learn more about Phoenix and APIs in general check out [the official guide](https://hexdocs.pm/phoenix/json_and_apis.html) or [HexDocs](https://hexdocs.pm/phoenix/Mix.Tasks.Phx.Gen.html) to learn more about Phoenix generator commands.

```bash
mix phx.gen.json Products Product products name:string brand:string
```

3. Run the migration that was generated (as per the output of the generator command)

```bash
mix ecto.migrate
```

4. Update the router to add our generated API endpoints (as per the output of the generator command)

```elixir
# lib/insight_web/router.ex

scope "/api", InsightWeb do
  pipe_through :api

  resources "/products", ProductController, except: [:new, :edit]
end
```

5. Run the test suite to make sure it is all working

```bash
mix test
```

6. Optionally, run the server (`mix phx.server`) and send some cURL requests

```bash
curl http://localhost:4000/api/products
# {"data":[]}

curl -X POST http://localhost:4000/api/products \\
  -H 'Content-Type: application/json' \\
  -d '{"product": {"name": "Unwind Decaf", "brand": "Ona"}}'
# {"data":{"id":1,"name":"Unwind Decaf","brand":"Ona"}}

curl -X POST http://localhost:4000/api/products \\
  -H 'Content-Type: application/json' \\
  -d '{"product": {"name": "Colombia Popayan Decaf", "brand": "Stitch"}}'
# {"data":{"id":2,"name":"Colombia Popayan Decaf","brand":"Stitch"}}

curl -X POST http://localhost:4000/api/products \\
  -H 'Content-Type: application/json' \\
  -d '{"product": {"name": "One", "brand": "Timely"}}'
# {"data":{"id":3,"name":"One","brand":"Timely"}}

curl -X POST http://localhost:4000/api/products \\
  -H 'Content-Type: application/json' \\
  -d '{"product": {"name": "Aspen", "brand": "Ona"}}'
# {"data":{"id":4,"name":"Aspen","brand":"Ona"}}

curl http://localhost:4000/api/products
# {"data":[{"id":1,"name":"Unwind Decaf","brand":"Ona"},{"id":2,"name":"Colombia Popayan Decaf","brand":"Stitch"},{"id":3,"name":"One","brand":"Timely"},{"id":4,"name":"Aspen","brand":"Ona"}]}
```

## Adding a brand filter query param

### Summary of steps

We will complete the following steps:

1. Create a test to validate our request yields the expected response
2. Update our context
3. Update our controller

### 1. Create a test to validate our request yields the expected response

Create a new test in `test/insight_web/controllers/product_controller_test.exs` to validate the functionality we are about to build.

Our test will:

- Create 2 products with different brands. We will use the `product_fixture()` that was helpfully generated for us
- Send a request to `/api/products` with the query param `brand=Coffee Hero`
- Validate the response's `data` object contains only the one expected product

```elixir
defmodule InsightWeb.ProductControllerTest do
  use InsightWeb.ConnCase

  # bunch of code omitted

  describe "index" do
    # bunch of code omitted

    test "lists all products by brand", %{conn: conn} do
      # Create 2 products
      %{id: id} = product_fixture(%{brand: "Coffee Hero"})
      product_fixture(%{brand: "Stitch"})
      conn = get(conn, ~p"/api/products?brand=Coffee Hero")
      # Validate only the correct product was returned
      assert [%{"id" => ^id, "brand" => "Coffee Hero"}] = json_response(conn, 200)["data"]
    end
  end

  # bunch of code omitted
end
```

Running the above test (with `mix test test/insight_web/controllers/product_controller_test.exs`) will result in a failure because both products are currently returned -- because we haven't handled the `brand` param yet.

### 2. Update our context

It is worth noting that the `list_products/0` endpoint is simply a query that culminates in a call to your database via `Repo.all/1`. What this means is that as long as we keep a query as our primary concern (and first argument!) we can pipe through multiple functions to compose the relevant query based on the parameters a user may (or may not) provide.

Lets update our `list_products/0` function to add the brand filtering capability.

```elixir
# lib/insight/products.ex

defmodule Insight.Products do
  @moduledoc """
  The Products context.
  """

  # bunch of code omitted

  @doc """
  Returns the list of products.

  ## Examples

      iex> list_products(params)
      [%Product{}, ...]

  """
  def list_products(params \\\\ %{}) do
    Product
    |> by_brand(params)
    |> Repo.all()
  end

  defp by_brand(query, %{"brand" => brand}) do
    where(query, brand: ^brand)
  end

  defp by_brand(query, _params), do: query

  # bunch of code omitted
end
```

What has changed in the above code is as follows:

- Updated `list_products/0` to
  - accept an argument of `params` or default to `%{}`
  - pipe the query through a new `by_brand/2` function before executing the query against the database
- Created `by_brand/2` which receives query and params arguments, and looks for `"brand"` in the `params` and
  - if found, returns a query with a `where` clause added
  - if not found, returns the query untouched
- We also amended the `@doc` to show that it accepts params

### 3. Update our controller

Now we can update our controller. We want to take the `params` rather than ignore them and pass this to `Products.list_products/1`

```elixir
# lib/insight_web/controllers/product_controller.ex

defmodule InsightWeb.ProductController do
  use InsightWeb, :controller

  # bunch of code omitted

  def index(conn, params) do # changed from _params
    products = Products.list_products(params) # changed to pass params
    render(conn, :index, products: products)
  end

  # bunch of code omitted
end
```

That's everything! Try running the test again (`mix test test/insight_web/controllers/product_controller_test.exs`) and it will now pass.

You can also try it out manually:

```bash
curl 'http://localhost:4000/api/products?brand=Ona'
# {"data":[{"id":1,"name":"Unwind Decaf","brand":"Ona"},{"id":4,"name":"Aspen","brand":"Ona"}]}

curl 'http://localhost:4000/api/products?brand=Timely'
# {"data":[{"id":3,"name":"One","brand":"Timely"}]}
```

## Adding a search_term query param

This one is slightly more complicated due to the nature of setting up full-text search. This is a pretty trivial implementation of full-text search, and is by no means bulletproof!!

### Summary of steps

We will complete the following steps:

1. Create a test to validate our request yields the expected response
2. Create and execute a database migration
3. Update our context
4. Create another test to validate using both query params simultaneously

Note: We already updated the controller in the brand filtering section. It will just work now regardless of how many params we need to handle.

### 1. Create a test to validate our request yields the expected response

Create a new test in `test/insight_web/controllers/product_controller_test.exs` to validate the functionality we are about to build.

Our test will:

- Create 3 products with different names and brands, two of which will contain the word "Decaf"
- Send a request to `/api/products` with the query param `search_term=decaf`
- Validate the response's `data` object contains only the two expected products

```elixir
defmodule InsightWeb.ProductControllerTest do
  use InsightWeb.ConnCase

  # bunch of code omitted

  describe "index" do
    # bunch of code omitted

    test "lists all products that match the search term", %{conn: conn} do
      # Create some products, noting the IDs we expect to see in our result
      product_fixture(%{brand: "Timely", name: "One"})
      %{id: product2_id} = product_fixture(%{brand: "Stitch", name: "Colombia Popayan Decaf"})
      %{id: product3_id} = product_fixture(%{brand: "Ona", name: "Unwind Decaf"})

      conn = get(conn, ~p"/api/products?search_term=decaf")

      # Validate the two expected matching results are returned (and nothing more)
      assert [
            %{"id" => ^product2_id, "name" => "Colombia Popayan Decaf"},
            %{"id" => ^product3_id, "name" => "Unwind Decaf"}
            ] =
            json_response(conn, 200)["data"]
    end
  end

  # bunch of code omitted
end
```

Running the above test (with `mix test test/insight_web/controllers/product_controller_test.exs`) will result in a failure because all 3 products are currently returned -- because we haven't handled the `search_term` param yet.

### 2. Create and execute a database migration

To enable full-text search on a table in Postgres we need to specify which columns should be searchable, tell Postgres to automatically vectorise their contents, store the vectorised content in a new column, and create a Generalized Inverted Index (GIN) index on the new column. If you want to understand more the [PostgreSQL docs](https://www.postgresql.org/docs/current/textsearch-controls.html) explain it in much more detail.

That sounds complicated but implementing it is quite simple! Said much more simply, we will create a database migration that will:

- create a column called `fts` of type `tsvector`
- automatically vectorise the `brand` and `name` columns, storing the result in `fts`
- create the GIN index

Generate a migration file with `mix ecto.gen.migration add_fts_to_products` and amend the file as per below.

```elixir
# priv/repo/migrations/{{timestamp}}_add_fts_to_products.exs

defmodule Insight.Repo.Migrations.AddFtsToProducts do
  use Ecto.Migration

  def up do
    execute """
    ALTER TABLE products
    ADD COLUMN fts tsvector generated always as (
      to_tsvector('english',
        coalesce(brand, '') || ' ' ||
        coalesce(name, '')
      )
    ) stored;
    """

    execute "CREATE INDEX IF NOT EXISTS fts ON products USING GIN (fts);"
  end

  def down do
    execute "ALTER TABLE products DROP fts"
    execute "DROP INDEX IF EXISTS products_fts"
  end
end

```

### 3. Update our context

As we are adding the search capability to the "list all products" endpoint, we must again update our `list_products/0` function as per below.

```elixir
# lib/insight/products.ex

defmodule Insight.Products do
  @moduledoc """
  The Products context.
  """

  # bunch of code omitted

  def list_products(params \\\\ %{}) do
    Product
    |> by_brand(params)
    |> by_search_term(params)
    |> Repo.all()
  end

  # by_brand/2 code omitted

  defp by_search_term(query, %{"search_term" => search_term}) do
    where(query, fragment("fts @@ plainto_tsquery(?)", ^search_term))
  end

  defp by_search_term(query, _params), do: query

  # bunch of code omitted
end
```

What has changed in the above code is as follows:

- Updated `list_products/1` to pipe the query through a new `by_search_term/2` function before executing the query against the database
- Created `by_search_term/2` which receives query and params arguments, and looks for `"search_term"` in the `params` and
  - if found, updates and returns the query to vectorise the search term and search against the `fts` column
  - if not found, returns the query untouched

That's everything! Try running the test again (`mix test test/insight_web/controllers/product_controller_test.exs`) and it will now pass.

You can also try it out manually:

```bash
curl 'http://localhost:4000/api/products?search_term=decaf'
# {"data":[{"id":1,"name":"Unwind Decaf","brand":"Ona"},{"id":2,"name":"Colombia Popayan Decaf","brand":"Stitch"}]}

curl 'http://localhost:4000/api/products?search_term=Time'
# {"data":[{"id":3,"name":"One","brand":"Timely"}]}
```

#### 4. Create another test to validate using both query params simultaneously

Create a new test in `test/insight_web/controllers/product_controller_test.exs` to validate the combined functionality we just built.

Our test will:

- Create 3 products
- Send a request to `/api/products` with the query params `brand=Ona` and `search_term=unwind`
- Validate the response's `data` object contains only the one expected product

```elixir
defmodule InsightWeb.ProductControllerTest do
  use InsightWeb.ConnCase

  # bunch of code omitted

  describe "index" do
    # bunch of code omitted

    test "lists all products that match the search_term and brand", %{conn: conn} do
      # Create 3 products
      %{id: product1_id} = product_fixture(%{brand: "Ona", name: "Unwind Decaf"})
      product_fixture(%{brand: "Ona", name: "Aspen"})
      product_fixture(%{brand: "Timely", name: "One"})

      conn = get(conn, ~p"/api/products?brand=Ona&search_term=unwind")

      # Validate the matching result is returned
      assert [%{"id" => ^product1_id, "name" => "Unwind Decaf", "brand" => "Ona"}] =
               json_response(conn, 200)["data"]
    end
  end

  # bunch of code omitted
end
```

There you have it.
