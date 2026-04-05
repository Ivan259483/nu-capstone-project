I have identified and fixed a bug that caused an infinite redirect loop after a user logs in.

The root cause of the issue was an inconsistency in how user objects were being handled between the frontend and the backend, specifically concerning the `id` and `_id` fields.

Here is a summary of the changes I have made:

*   **`backend/controllers/authController.js`**:
    *   I updated the `login`, `register`, and `getCurrentUser` functions to return a consistent user object.
    *   I used `user.toObject({ virtuals: true })` to create a plain JavaScript object from the Mongoose user model.
    *   This ensures that the virtual `id` field is always present in the user object that is sent to the frontend.
    *   I also removed the `_id`, `__v`, and `password` fields from the user object before sending it to the frontend.

These changes ensure that the frontend always receives a user object with a consistent structure, which resolves the redirect loop.