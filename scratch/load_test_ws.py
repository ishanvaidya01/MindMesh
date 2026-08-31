import asyncio
import websockets
import json
import uuid
import requests
import random
import time

BASE_URL = "http://localhost:8000/api"
WS_URL = "ws://localhost:8000/ws/room"

async def simulate_student(room_code, student_id):
    # Register as guest
    res = requests.post(f"{BASE_URL}/rooms/{room_code}/join/", json={
        "display_name": f"Student_{student_id}_{uuid.uuid4().hex[:4]}"
    })
    if not res.ok:
        print(f"Student {student_id} failed to join: {res.text}")
        return
        
    data = res.json()
    session_token = data["session_token"]
    participant_id = data["participant_id"]
    
    uri = f"{WS_URL}/{room_code}/"
    try:
        async with websockets.connect(uri) as ws:
            # Authenticate
            await ws.send(json.dumps({
                "type": "authenticate",
                "session_token": session_token
            }))
            
            # Wait for messages
            while True:
                msg = await ws.recv()
                msg_data = json.loads(msg)
                
                # If question shown, wait a bit and answer
                if msg_data.get("type") == "question_shown":
                    q = msg_data["question"]
                    options = q["options"]
                    if not options:
                        continue
                        
                    # Wait random time to simulate thinking
                    await asyncio.sleep(random.uniform(1.0, 5.0))
                    
                    # Submit answer
                    selected = random.choice(options)
                    await ws.send(json.dumps({
                        "type": "submit_answer",
                        "question_id": q["id"],
                        "option_id": selected["id"],
                        "confidence": random.randint(10, 100)
                    }))
                    
                # If session ends, we break
                if msg_data.get("type") == "session_ended":
                    break
    except Exception as e:
        print(f"Student {student_id} encountered an error: {e}")

async def main():
    print("--- Starting WebSocket Load Test ---")
    
    # 1. Register a host
    test_username = f"host_{uuid.uuid4().hex[:8]}@example.com"
    res = requests.post(f"{BASE_URL}/auth/register/", json={
        "username": test_username,
        "password": "password123",
        "full_name": "Test Host"
    })
    if not res.ok:
        print("Failed to register host")
        return
        
    res = requests.post(f"{BASE_URL}/auth/login/", json={
        "username": test_username,
        "password": "password123"
    })
    token = res.json()["token"]
    headers = {"Authorization": f"Token {token}"}
    
    # 2. Create Quiz
    quiz_data = {
        "title": "Load Test Quiz",
        "owner": test_username,
        "questions": [
            {
                "text": f"Question {i}",
                "time_limit_seconds": 30,
                "options": [
                    {"text": "A", "is_correct": True},
                    {"text": "B", "is_correct": False},
                    {"text": "C", "is_correct": False}
                ]
            } for i in range(1, 4)
        ]
    }
    res = requests.post(f"{BASE_URL}/quizzes/", json=quiz_data, headers=headers)
    quiz_id = res.json()["id"]
    
    # 3. Create Room
    res = requests.post(f"{BASE_URL}/rooms/create/", json={
        "quiz": quiz_id,
        "host": "Test Host"
    }, headers=headers)
    
    room_code = res.json()["code"]
    host_token = res.json()["host_token"]
    print(f"Created room: {room_code}")
    
    # 4. Start N students
    NUM_STUDENTS = 20
    print(f"Spawning {NUM_STUDENTS} students...")
    
    tasks = []
    for i in range(NUM_STUDENTS):
        tasks.append(asyncio.create_task(simulate_student(room_code, i)))
        
    # 5. Host connection
    print("Connecting Host...")
    uri = f"{WS_URL}/{room_code}/"
    async with websockets.connect(uri) as host_ws:
        await host_ws.send(json.dumps({
            "type": "authenticate",
            "host_token": host_token
        }))
        
        # Wait for students to connect
        await asyncio.sleep(2)
        
        # Push 3 questions
        for _ in range(3):
            print("Host pushing question...")
            await host_ws.send(json.dumps({
                "type": "host_push_question"
            }))
            # Wait for students to answer
            await asyncio.sleep(7)
            
        print("Host ending session...")
        await host_ws.send(json.dumps({
            "type": "host_end_session"
        }))
        
    print("Waiting for students to finish...")
    await asyncio.gather(*tasks)
    print("--- Load Test Finished ---")
    
if __name__ == "__main__":
    asyncio.run(main())
