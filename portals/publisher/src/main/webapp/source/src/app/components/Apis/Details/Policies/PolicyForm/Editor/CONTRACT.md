# nodeId contract (UI &lt;-&gt; Gateway)

This file is the single source of truth for how a Synapse mediation sequence (rendered from a
`.j2` operation policy) is decomposed into `nodeId` values. Both sides implement this contract
independently against the **same fixtures** (see `__fixtures__/`) so that a `nodeId` produced by
the UI parser (`parsing/parseSynapseXml.ts`) always refers to the same mediator element that the
Java-side `SequenceInstrumenter` (carbon-apimgt, Fase 2) will insert a `TraceMarkerMediator` before.

## Normalization

The contract is defined **after normalization**:
- If the document root is a single `<sequence>` element (the shape produced when a user uploads
  a raw `.j2` file, e.g. the `lean-auth-policy` sample), it is unwrapped: the root's `name`
  attribute and the `<sequence>` wrapper itself are discarded, and its direct element children
  become the top-level node list.
- If the document root is not a `<sequence>` (the "mediators-only" shape used by policy authors
  who only write the body, e.g. the starter templates), a synthetic root is used purely for
  parsing; its children are the top-level node list.
- Both shapes therefore produce **identical nodeIds** for the same mediator content. This is
  verified by `__tests__/parseSynapseXml.test.ts`, which parses both the wrapped and
  mediators-only fixtures and asserts the nodeId -> tag maps are equal.

## Path syntax

A `nodeId` is a `/`-separated path of zero-based indices among **flow-level mediator elements**
within successive containers, e.g.:
- `3` - the 4th top-level mediator.
- `5/then/1` - the 2nd mediator inside the `then` branch of the `filter` at top-level index 5.
- `6/case[2]/0` - the 1st mediator inside the 3rd `case` of the `switch` at index 6.
- `6/default/0` - the 1st mediator inside the `default` branch of that same `switch`.

Indices only count **flow mediator** elements. Configuration/child elements that are not
themselves mediators (see "Non-flow elements" below) are skipped entirely: they do not consume an
index and are not addressable by a `nodeId`.

Comments, CDATA sections and processing instructions never consume an index and never form part
of a path, in either the UI parser or the Java instrumenter.

## Containers

A "container" is any point in the document where a **list** of sibling flow mediators occurs.
Indices restart at `0` at the start of every container.

| Container | Path segment(s) added | Notes |
|---|---|---|
| Root sequence (after normalization) | *(none - this is the base path)* | Top-level mediator list |
| `filter` **with** `then`/`else` | `then`, `else` | Each branch is its own container |
| `filter` **without** `then`/`else`, i.e. its own children are inline mediators | `then` | See "Filter without then/else" below |
| `switch` | `case[i]` (0-based index **among `case` elements only**), `default` | `default` is optional; when absent no path uses it |
| `clone` / `iterate` target `<target><sequence>...</sequence></target>` | `target[i]` for `clone` (i = 0-based index among `<target>` elements), `target` for `iterate`/`foreach` (single target) | The mediator index continues inside the inline `<sequence>` |
| `throttle` | `onAccept`, `onReject` | |
| `cache` | `onCacheHit` | |
| `aggregate` | `onComplete` | |
| `validate` | `on-fail` | |

### Filter without then/else

Decision: when a `<filter>` element's direct children are mediators (no `<then>`/`<else>`
wrapper - the older Synapse filter-mediator shape), those children are treated as if they were
the `then` branch: the path segment used is **`then`** (not e.g. `children` or `body`). This keeps
a single, predictable segment name for "the branch taken when the filter condition is true"
regardless of which XML shape was used, and avoids inventing a segment name that has no meaning
in the `<then>`/`<else>` shape. The Java `SequenceInstrumenter` mirrors this exact rule.

### Switch cases

`case` elements are indexed among themselves only (0-based), ignoring any other switch
configuration attributes (e.g. the `source` XPath on `<switch>` itself, which is not addressable).
`case[i]` always uses the bracket form, e.g. `6/case[0]/0`, `6/case[1]/2`.

## Non-flow elements (do not consume an index, not addressable)

These elements are configuration for their parent mediator, not mediators themselves, and are
therefore skipped by both the indexer and the instrumenter:
- `log`: `property`
- `payloadFactory`: `format`, `args`, `arg`
- `call` / `send`: `endpoint`, and everything inside it (`http`, `address`, etc.)
- `enrich`: `source`, `target`
- `switch`: the `source` attribute only (no child element); `case`/`default` themselves ARE
  containers (see above) but are not flow mediators - only their contents are addressed via
  `case[i]/...` / `default/...`.
- `header`, `property`: any nested `value`/`expression` child elements some tools may emit.
- Any element under `<args>`/`<format>` of `payloadFactory`.

If an unrecognized element appears where a mediator is expected, it is still treated as a flow
mediator (and consumes an index) so that unknown/future mediators keep working; it is only
elements known to be pure configuration that are excluded.

## Worked example: `lean-auth-policy` sample

Given the sample policy in `__fixtures__/lean-auth-policy.xml` (root `<sequence>`, unwrapped) and
its mediators-only twin `__fixtures__/lean-auth-policy.mediators-only.xml` (no root `<sequence>`),
both normalize to the same 17 top-level flow mediators:

```
0   property   ORIGINAL_JSON_PAYLOAD
1   property   ORIGINAL_HTTP_METHOD
2   property   ORIGINAL_MESSAGE_TYPE
3   property   ORIGINAL_CONTENT_TYPE
4   property   ORIGINAL_REST_URL_POSTFIX
5   property   REST_URL_POSTFIX (action=remove)
6   property   HTTP_METHOD=POST
7   property   messageType=application/x-www-form-urlencoded
8   property   ContentType=application/x-www-form-urlencoded
9   payloadFactory (media-type=text)          <- <format>/<args> are config, not addressable
10  call (blocking=true)                       <- <endpoint>/<http> are config, not addressable
11  log (level=full)                           <- <property> inside log is config, not addressable
12  filter (source=..., regex=200)
12/then/0   property        LEAN_ACCESS_TOKEN
12/then/1   payloadFactory  (media-type=json)   <- <format>/<args>/<arg> are config
12/then/2   property        Authorization
12/else/0   log             (level=custom)
12/else/1   property        HTTP_SC=401
12/else/2   payloadFactory  (media-type=json)
12/else/3   respond
13  property   HTTP_METHOD (restore)
14  property   messageType (restore)
15  property   ContentType (restore)
16  property   REST_URL_POSTFIX (restore)
```

XML comments interleaved between mediators (see the fixture) do not shift any of the indices
above - `parseSynapseXml` and the Java instrumenter both skip comment nodes when computing
container-relative indices.

The exact expected mapping is checked into `__fixtures__/nodeIds.expected.json` and is asserted
against by both the UI unit tests (this package) and the Java-side gateway tests (carbon-apimgt,
Fase 2) so that a drift between the two implementations fails CI on whichever side changes first.
