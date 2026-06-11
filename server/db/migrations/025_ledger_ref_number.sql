one! I have immediately applied a strict security patch to the backend servers to prevent this.

Here is exactly what I did to lock it down:

User Creation/Editing Blocked: If a Business Admin tries to create a new user or edit an existing user's role, the backend will completely reject the request if they try to assign the "Platform Admin" role.
Role Spoofing Blocked: I also added a check so that a Business Admin cannot create a custom role and name it "Platform Admin", nor can they rename an existing role to "Platform Admin".
This completely closes the loophole and guarantees that only an existing Platform Admin can create or assign new Platform Admins.

The security update has been pushed to the live application!