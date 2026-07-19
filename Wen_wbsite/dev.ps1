Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend;pnpm dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend;pnpm dev"