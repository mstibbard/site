---
title: Counting associated records with Elixir and Ecto
description: Two ways to count associated records with Elixir and Ecto
datePublished: '2024-01-05'
---

I've often found myself wanting to know how many associated records exist for a given entity in a project's database, so I've captured two ways of doing it with Ecto here. Specifically:

1. Using multiple database transactions, aggregates and combining the results
2. Using one database transaction with inner join laterals

Please note that these _can be_ quite costly transactions depending on your real scenario, so try to minimise their usage in common scenarios/hot paths.

For the purpose of this example, assume we have a very simple database like below, and **we want to know how many Products and Consumers exist for a given Vendor**.

<img src="/images/elixir-ecto-count-erd.svg" />

I've added 2 virtual fields to the Vendor schema for us to populate with the counts. I've omitted the changeset for brevity.

```elixir
defmodule Insight.Vendors.Vendor do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "vendors" do
    field :name, :string
    field :consumer_count, :integer, virtual: true, default: 0
    field :product_count, :integer, virtual: true, default: 0
    has_many :consumers, Insight.Consumers.Consumer
    has_many :products, Insight.Products.Product
  end
end
```

This means our Vendor struct will look something like this by default, and we want to populate `consumer_count` and `product_count` whenever we retrieve a specific vendor.

```elixir
%Insight.Vendors.Vendor{
  __meta__: #Ecto.Schema.Metadata<:loaded, "vendors">,
  id: "4cda6cf6-dd4f-4264-9e8e-62f24f18c666",
  name: "Nike",
  consumer_count: 0,
  product_count: 0,
  consumers: #Ecto.Association.NotLoaded<association :consumers is not loaded>,
  products: #Ecto.Association.NotLoaded<association :products is not loaded>
}
```

## 1. Using multiple database transactions, aggregates and combining the results

```elixir
# lib/insight/vendors.ex -- Multiple DB transactions example
def get_vendor!(id) do
  Vendor
  |> Repo.get!(id)
  |> add_assoc_count(:consumers, :consumer_count)
  |> add_assoc_count(:products, :product_count)
end

defp add_assoc_count(struct, assoc, key) do
  count =
    struct
    |> Ecto.assoc(assoc)
    |> Repo.aggregate(:count, :id)

  Map.put(struct, key, count)
end
```

This is the cleanest and most digestible solution I've found, making good use of Elixir and Ecto's composability. However it does result in 3 transactions with the database in our example.

Our private function `add_assoc_count/3` makes use of [Ecto.assoc/3](https://hexdocs.pm/ecto/Ecto.html#assoc/3) to build a query for the given association (`:consumers` and `:products`), [Ecto.Repo.aggregate/3](https://hexdocs.pm/ecto/Ecto.Repo.html#c:aggregate/3) to count the records, and adds the result into the Vendor struct under the appropriate key (`:consumer_count` and `:product_count`) with [Map.put/3](https://hexdocs.pm/elixir/1.12/Map.html#put/3).

## 2. Using one database transaction with inner join laterals

```elixir
# lib/insight/vendors.ex -- LATERAL JOIN example
def get_vendor!(id) do
  consumer_subquery =
    Consumer
    |> where([c], c.vendor_id == parent_as(:vendor).id)
    |> select([c], %{consumer_count: count(c.id)})

  product_subquery =
    Product
    |> where([p], p.vendor_id == parent_as(:vendor).id)
    |> select([p], %{product_count: count(p.id)})

  Vendor
  |> from(as: :vendor)
  |> where(id: ^id)
  |> join(:inner_lateral, [], subquery(consumer_subquery), on: true)
  |> join(:inner_lateral, [], subquery(product_subquery), on: true)
  |> select([v, c, p], %{v | consumer_count: c.consumer_count, product_count: p.product_count})
  |> Repo.one!()
end
```

This achieves the same outcome but gets a fully processed result back from the database in one transaction.

It makes use of [Ecto.Query.join/5](https://hexdocs.pm/ecto/Ecto.Query.html#join/5) with a qualifier type of `:inner_lateral` and multiple subqueries via [Ecto.Query.subquery/2](https://hexdocs.pm/ecto/Ecto.Query.html#subquery/2).

Each subquery performs the count calculation, and then the final select statement creates the desired response containing the entire vendor struct and the two calculated fields.

It is less readable than #1 but may be more performant for your use case.
