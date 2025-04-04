# Call a function

The simplest way to get started in JavaScript is to
call one of the built-in JavaScript functions. Just like how Blocks
are organized into categories/drawers, the functions are organized by
namespaces, with names corresponding to the drawer names.

```typescript-ignore
Math.abs(-1)
```

### ~ hint

#### Functions in a namespace

If you want to see all functions available in the `Math` namespace, simply type `Math`
followed by `.` and a list of all the functions will appear. 

### ~

## Left and right parentheses, please!

Whenever you want to call a function, you give the name of the function
followed by `(` and ending with `)`. In between the left and right
parentheses go the function arguments:

```typescript-ignore
Math.min(1, 2)
```

It's a syntax error to have a left parenthesis without the "closing" right parenthesis:

```typescript-ignore
Math.min(
```

If a function has zero arguments, you still
need the parentheses in order to call the function.

## Any results for me?

Many functions return a result for you to use later in your program. This might be a number, a string, or another type of data.

```typescript-ignore
let greater = Math.max(5, 10)
``` 